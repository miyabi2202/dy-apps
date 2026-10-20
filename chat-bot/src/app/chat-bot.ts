import { parseCommand, type CommandCall } from '../core/command';
import { errorMessage } from '../core/errors';
import type { Heard } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, oneMessage } from '../core/reply';
import type { Gift, IncomingChat } from '../core/room-events';
import type { Billing, Charge } from './billing';
import type { Command, CommandResult } from './command';
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

/** A mention waiting for its asker to send a gift and pay for it. */
interface Unpaid {
  chat: IncomingChat;
  question: string;
  at: number;
  /** For what the bot would say to them unprompted, rather than an @. */
  unprompted?: Heard;
  /** The room's own command to answer it with, by id. */
  command?: string;
}

/**
 * Decides what each @mention of the bot is: a question, paid for by the asker and handed to the
 * answerer, or, with a `/` first, one of `commands` (`/修改人设 …`), paid for like a question but
 * at the command's own price. A command takes effect at once and the bot says how it went in a
 * system message. Admin-only commands, and commands nobody has, are ignored from anyone but an
 * admin, unless they have commands of their own to be told about. With billing, a viewer who
 * can't pay gets a fixed notice, put in the outbox straight away rather than waiting behind the
 * questions for Claude, and their mention (the last one) waits: a gift from them within
 * `waitForGiftMs` (5 minutes) pays for it and has it answered at once.
 */
export class ChatBot {
  /** Commands still running, like one waiting for Claude. */
  private readonly running = new Set<Promise<void>>();
  private readonly commands: ReadonlyMap<string, Command>;
  private readonly maxLength: number;
  /** Each viewer's last mention they couldn't pay for, by user id. */
  private readonly unpaid = new Map<string, Unpaid>();

  constructor(private readonly options: ChatBotOptions) {
    this.commands = new Map((options.commands ?? []).map((command) => [command.name, command]));
    this.maxLength = options.maxReplyLength ?? DOUYIN_CHAT_LIMIT;
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
    while (this.running.size) await Promise.all(this.running);
    await this.options.answerer.idle();
  }

  /** Runs the command the mention gives, or charges the asker and hands the question on. */
  private onMention(chat: IncomingChat, question: string): void {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = this.isAdmin(userId);
    const call = parseCommand(question);
    if (call) {
      this.track(this.onCommand(chat, question, call, admin));
      return;
    }
    const charge = this.charge(chat, question, admin);
    if (!charge.ok) return;
    this.ask({
      asker,
      userId,
      paid: charge.paid,
      question,
      history: this.options.room.recentChat(),
    });
  }

  /** Answers the giver's unpaid mention, now that they may be able to pay for it. */
  private onGift({ userId }: Gift): void {
    const unpaid = this.unpaid.get(userId);
    if (!unpaid) return;
    this.unpaid.delete(userId);
    const { now = Date.now, waitForGiftMs = 5 * 60_000, log } = this.options;
    if (now() - unpaid.at > waitForGiftMs) return;
    log.info('answering after a gift', { asker: unpaid.chat.nickname, userId });
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
    const command = this.commands.get(name);
    if (!command?.adminOnly) return false;
    const { log, adminNames = '机器人管理员' } = this.options;
    const admin = this.isAdmin(userId);
    log.info('command requested', { asker, userId, name, args, admin });
    if (!admin) {
      this.say(asker, 'system', `你无权调用「${name}」指令，只有主播和${adminNames}才可以`);
      return true;
    }
    const question = `/${name}${args ? ` ${args}` : ''}`;
    const ts = (this.options.now ?? Date.now)();
    const chat: IncomingChat = { ts, userId, nickname: asker, content: question, mentions: [] };
    this.track(this.onCommand(chat, question, { name, args }, true));
    return true;
  }

  /** Keeps a command that's still running, for idle(). */
  private track(pending: Promise<void> | undefined): void {
    if (!pending) return;
    const run = pending.finally(() => this.running.delete(run));
    this.running.add(run);
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
    const charge = this.charge(chat, question, this.isAdmin(userId), undefined, heard, own);
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
  private charge(
    chat: IncomingChat,
    question: string,
    admin: boolean,
    command?: Command,
    unprompted?: Heard,
    additional?: AdditionalCommand,
  ): Charge {
    const { nickname: asker, userId } = chat;
    const { billing, log } = this.options;
    if (admin || !billing) return { ok: true, paid: 0 };
    const price = command?.price ?? additional?.price ?? billing.cost;
    const charge = billing.charge(userId, asker, price);
    if (charge.ok) return charge;
    if (userId) {
      const { now = Date.now, waitForGiftMs = 5 * 60_000 } = this.options;
      const at = now();
      // Only a gift removes an entry, so those that nobody came back for are dropped here.
      for (const [id, { at: since }] of this.unpaid) {
        if (at - since > waitForGiftMs) this.unpaid.delete(id);
      }
      this.unpaid.set(userId, {
        chat,
        question,
        at,
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
    if (charge.notify) this.say(asker, 'notice', notice);
    return charge;
  }

  /**
   * Runs a command the asker may use, once they've paid for it, and tells them how it went;
   * a call to one they may not use is ignored, or, when they have commands, answered with those.
   * A command with its own prompt is handed to the answerer like a mention. A promise while a
   * command that waits (on Claude, say) is still running.
   */
  private onCommand(
    chat: IncomingChat,
    question: string,
    { name, args }: CommandCall,
    admin: boolean,
  ): Promise<void> | undefined {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    const command = this.commands.get(name);
    if (!command || (command.adminOnly && !admin)) {
      const usable = [...this.commands.values()].filter((c) => admin || !c.adminOnly);
      log.info('no such command for them', { asker, userId, name, admin });
      if (usable.length) {
        const names = usable.map((c) => c.name).join('、');
        this.say(asker, 'system', `没有指令「${name}」，可用的有：${names}`);
      }
      return;
    }
    const charge = this.charge(chat, question, admin, command);
    if (!charge.ok) return undefined;
    if (command.prompt) {
      log.info('command', { asker, userId, name, args, paid: charge.paid });
      this.ask({
        asker,
        userId,
        paid: charge.paid,
        question: args,
        history: this.options.room.recentChat(),
        template: command.prompt(),
        tools: command.tools,
        maxTurns: command.maxTurns,
        ask: command.ask,
        pickTranscript: command.pickTranscript,
        alwaysScreenshot: command.alwaysScreenshot,
        jsonMessage: command.jsonMessage,
        atOthers: command.atOthers,
      });
      return undefined;
    }
    const failed = (err: unknown): CommandResult => {
      log.error('command failed', { name, error: errorMessage(err) });
      return { ok: false, reply: `指令「${name}」出错了，没有完成` };
    };
    const finish = (result: CommandResult) => {
      log.info('command', { asker, userId, name, args, ...result, paid: charge.paid });
      if (!result.ok && userId) this.refund({ asker, userId, paid: charge.paid });
      if (result.reply) this.say(asker, 'system', result.reply);
    };
    let result: CommandResult | Promise<CommandResult>;
    try {
      result = command.run(args);
    } catch (err) {
      result = failed(err);
    }
    // A command that answers at once is done at once, so its refund and reply keep their order.
    if (!(result instanceof Promise)) {
      finish(result);
      return undefined;
    }
    return result.catch(failed).then(finish);
  }

  /** Queues `@asker text` to be sent. */
  private say(asker: string, kind: 'system' | 'notice', text: string): void {
    this.options.outbox.push({
      kind,
      text: oneMessage(asker, text, this.maxLength) ?? `@${asker} ${text}`,
    });
  }
}
