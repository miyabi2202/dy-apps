import { parseCommand } from '../core/command';
import type { Gift, IncomingChat } from '../core/room-events';
import type { Billing, Charge } from './billing';
import type { Command } from './command';
import { CommandRunner, type ChargeRequest } from './command-runner';
import {
  refundMention,
  type Mention,
  type MentionAnswerer,
  type UnpromptedReply,
} from './mention-answerer';
import type { Outbox } from './outbox';
import type { AdditionalCommand, Admins, Log } from './ports';
import type { RoomFeed } from './room-feed';
import type { RoomState } from './room-state';
import { UnpaidMentions } from './unpaid-mentions';

export interface ChatBotOptions {
  /** Where the mentions come from, and the thing to start and stop. */
  feed: Pick<RoomFeed, 'onMention' | 'onGift' | 'start' | 'stop'>;
  /** Answers the questions the bot has been paid for. */
  answerer: Pick<MentionAnswerer, 'ask' | 'idle'>;
  /** The chat before a question goes with it to the answerer. */
  room: Pick<RoomState, 'recentChat'>;
  /** Where notices and command replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** Charges for mentions from what viewers gift. Without it, mentions are free. */
  billing?: Billing;
  /** User ids of the admins: their mentions and commands are free, and only they can run the
   * admin-only commands. */
  admins?: Admins;
  /** What a mention starting with `/` can run. */
  commands?: readonly Command[];
  /**
   * The room's own commands: answered with their own prompt when Claude finds a mention asking
   * for one, or auto-reply picks one for what someone said.
   */
  additionalCommands?: readonly AdditionalCommand[];
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  /** Who may run admin-only commands, as viewers know them: 「只有主播和…才可以」. */
  adminNames?: string;
  /** A mention its asker couldn't pay for is answered if they send a gift within this long. */
  waitForGiftMs?: number;
  now?: () => number;
}

/**
 * Decides what each @mention of the bot is: a question, paid for by the asker and handed to the
 * answerer, or, with a `/` first, one of `commands` (`/修改人设 …`), paid for like a question but
 * at the command's own price, which the CommandRunner runs. With billing, a viewer who
 * can't pay gets a fixed notice, put in the outbox straight away rather than waiting behind the
 * questions for Claude, and their mention (the last one) waits: a gift from them within
 * `waitForGiftMs` (5 minutes) pays for it and has it answered at once (see UnpaidMentions).
 */
export class ChatBot {
  private readonly runner: CommandRunner;
  /** Each viewer's last mention they couldn't pay for. */
  private readonly unpaid: UnpaidMentions;

  constructor(private readonly options: ChatBotOptions) {
    this.unpaid = new UnpaidMentions({ now: options.now, waitMs: options.waitForGiftMs });
    this.runner = new CommandRunner({
      commands: options.commands ?? [],
      outbox: options.outbox,
      room: options.room,
      log: options.log,
      charge: (request) => this.charge(request),
      ask: (mention) => this.ask(mention),
      refund: (mention) => this.refund(mention),
      isAdmin: (userId) => this.isAdmin(userId),
      maxReplyLength: options.maxReplyLength,
      adminNames: options.adminNames,
      now: options.now,
    });
  }

  start(): void {
    this.options.feed.onMention((chat, question) => this.onMention(chat, question));
    this.options.feed.onGift((gift) => this.onGift(gift));
    this.options.feed.start();
  }

  stop(): void {
    this.options.feed.stop();
  }

  /** Resolves once Claude has answered every queued mention, and every command has finished. */
  async idle(): Promise<void> {
    await this.runner.idle();
    await this.options.answerer.idle();
  }

  /**
   * Runs the command the mention gives, or charges the asker and hands the question on: to the
   * room's own command whose trigger it matches, at that command's price, when there is one.
   */
  private onMention(chat: IncomingChat, question: string): void {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = this.isAdmin(userId);
    const call = parseCommand(question);
    if (call) {
      this.runner.run(chat, question, call, admin);
      return;
    }
    const own = this.options.additionalCommands?.find(
      ({ trigger, adminOnly }) => trigger?.test(question) && (!adminOnly || admin),
    );
    if (own) log.info('additional command triggered', { asker, userId, command: own.id });
    this.askMention(chat, question, admin, own);
  }

  /**
   * Charges for a mention and hands it on, with the room's own command `own` if there is one;
   * when that command's answer is empty (it wasn't really for it), asked again as usual.
   */
  private askMention(
    chat: IncomingChat,
    question: string,
    admin: boolean,
    own?: AdditionalCommand,
  ): void {
    const { nickname: asker, userId } = chat;
    const charge = this.charge({ chat, question, admin, additional: own });
    if (!charge.ok) return;
    this.ask({
      asker,
      userId,
      paid: charge.paid,
      question,
      history: this.options.room.recentChat(),
      ...(own && {
        ...this.commandPrompt(own),
        ifEmpty: () => {
          this.options.log.info('not for the command, answering as usual', {
            asker,
            command: own.id,
          });
          this.askMention(chat, question, admin);
        },
      }),
    });
  }

  /** Answers the giver's unpaid mention, now that they may be able to pay for it. */
  private onGift({ userId }: Gift): void {
    const unpaid = this.unpaid.claim(userId);
    if (!unpaid) return;
    this.options.log.info('answering after a gift', { asker: unpaid.chat.nickname, userId });
    const { chat, question, unprompted, command } = unpaid;
    if (unprompted) {
      const { nickname } = chat;
      this.replyUnprompted({
        nickname,
        userId,
        question,
        heard: unprompted,
        ...(command && { command }),
      });
    } else this.onMention(chat, question);
  }

  /**
   * Someone asked, in so many words, for what an admin-only command does (Claude found it in their
   * mention, or in what they said to the bot): an admin's runs as if they'd typed it, and anyone
   * else is told they may not. One of the room's own commands (主播会唱xxx吗) is asked again with
   * its own prompt, already paid for. False for anything else, so Claude's own reply goes out
   * instead (the others cost diamonds, already paid for the mention).
   */
  requestCommand(mention: Mention, name: string, args: string): boolean {
    const { asker, userId } = mention;
    // One of the room's own: answered with its prompt instead, already paid for.
    const own = this.additionalCommand(name);
    if (own?.adminOnly && !this.isAdmin(userId)) {
      // Not theirs to ask for: Claude's own reply goes out instead.
      this.options.log.info('additional command not for them', { asker, userId, command: own.id });
      return false;
    }
    if (own) {
      this.options.log.info('additional command requested', { asker, userId, command: own.id });
      // The @ was paid for at an @'s price; a cheaper command gives the difference back.
      let { paid } = mention;
      if (own.price !== undefined && own.price < paid) {
        this.refund({ asker, userId, paid: paid - own.price });
        paid = own.price;
      }
      this.ask({ ...mention, paid, ...this.commandPrompt(own) });
      return true;
    }
    return this.runner.request(mention, name, args);
  }

  /**
   * Answers what someone said to or about the bot without an @ (auto-reply picked it), like a
   * mention: they pay for it (nothing for the streamer or an admin), and one who can't is told
   * so, in other words, and answered once they send a gift.
   */
  replyUnprompted({ nickname, userId, question, heard, command }: UnpromptedReply): void {
    const ts = (this.options.now ?? Date.now)();
    const chat: IncomingChat = { ts, userId, nickname, content: question, mentions: [] };
    const own = command === undefined ? undefined : this.additionalCommand(command);
    this.options.log.info('unprompted', { asker: nickname, userId, question, heard, command });
    if (own?.adminOnly && !this.isAdmin(userId)) {
      this.options.log.info('additional command not for them', { asker: nickname, command });
      return;
    }
    const charge = this.charge({
      chat,
      question,
      admin: this.isAdmin(userId),
      unprompted: heard,
      additional: own,
    });
    if (!charge.ok) return;
    this.ask({
      asker: nickname,
      userId,
      paid: charge.paid,
      question,
      history: this.options.room.recentChat(),
      unprompted: heard,
      ...(own && this.commandPrompt(own)),
    });
  }

  /** How the room's own command `own` is answered: with its prompt, in JSON. */
  private commandPrompt(
    own: AdditionalCommand,
  ): Pick<Mention, 'template' | 'jsonMessage' | 'atOthers'> {
    return { template: own.prompt(), jsonMessage: true, ...(own.atOthers && { atOthers: true }) };
  }

  /** The room's own command `name` (its id, or what it's for), if there is one. */
  private additionalCommand(name: string): AdditionalCommand | undefined {
    return this.options.additionalCommands?.find(({ id, name: title }) =>
      [id, title].includes(name),
    );
  }

  private isAdmin(userId: string | undefined): boolean {
    return userId !== undefined && !!this.options.admins?.has(userId);
  }

  /** Hands a mention to the answerer, giving the price back if it was dropped. */
  private ask(mention: Mention): void {
    if (!this.options.answerer.ask(mention)) this.refund(mention);
  }

  private refund(mention: Pick<Mention, 'asker' | 'userId' | 'paid'>): void {
    refundMention(this.options.billing, this.options.log, mention);
  }

  /**
   * Takes the price of a mention, or of `command`, from the asker, nothing from an admin; when
   * they can't pay, queues a notice, keeps the mention (`question`, or what the bot would say to
   * them `unprompted`, with the room's own command `additional`, at its price) for when they send
   * a gift, and says so.
   */
  private charge({
    chat,
    question,
    admin,
    command,
    unprompted,
    additional,
  }: ChargeRequest): Charge {
    const { nickname: asker, userId } = chat;
    const { billing, log } = this.options;
    if (admin || !billing) return { ok: true, paid: 0 };
    const price = command?.price ?? additional?.price ?? billing.cost;
    const charge = billing.charge(userId, asker, price);
    if (charge.ok) return charge;
    if (userId) {
      this.unpaid.keep(userId, {
        chat,
        question,
        ...(unprompted && { unprompted }),
        ...(additional && { command: additional.id }),
      });
    }
    log.info('balance too low', {
      asker,
      userId,
      balance: billing.balance(userId),
      command: command?.name,
    });
    const priced = command ?? additional;
    const notice = billing.lowBalanceNotice(
      userId,
      priced && { name: priced.name, price },
      !!unprompted,
    );
    if (charge.notify) this.runner.say(asker, 'notice', notice);
    return charge;
  }
}
