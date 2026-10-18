import { parseCommand, type CommandCall } from '../core/command';
import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, oneMessage } from '../core/reply';
import type { Gift, IncomingChat } from '../core/room-events';
import type { Billing, Charge } from './billing';
import type { Command, CommandResult } from './command';
import { refundMention, type Mention, type MentionAnswerer } from './mention-answerer';
import type { Outbox } from './outbox';
import type { Admins, Log } from './ports';
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
  /** Douyin's chat length limit, for the bot's own messages. */
  maxReplyLength?: number;
  /** A mention its asker couldn't pay for is answered if they send a gift within this long. */
  waitForGiftMs?: number;
  now?: () => number;
}

/** A mention waiting for its asker to send a gift and pay for it. */
interface Unpaid {
  chat: IncomingChat;
  question: string;
  at: number;
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
      const pending = this.onCommand(chat, question, call, admin);
      if (pending) {
        const run = pending.finally(() => this.running.delete(run));
        this.running.add(run);
      }
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
    this.onMention(unpaid.chat, unpaid.question);
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
   * they can't pay, queues a notice, keeps the mention (`question`) for when they send a gift,
   * and says so.
   */
  private charge(chat: IncomingChat, question: string, admin: boolean, command?: Command): Charge {
    const { nickname: asker, userId } = chat;
    const { billing, log } = this.options;
    if (admin || !billing) return { ok: true, paid: 0 };
    const price = command?.price ?? billing.cost;
    const charge = billing.charge(userId, asker, price);
    if (charge.ok) return charge;
    if (userId) this.unpaid.set(userId, { chat, question, at: (this.options.now ?? Date.now)() });
    log.info('balance too low', {
      asker,
      userId,
      balance: billing.balance(userId),
      command: command?.name,
    });
    const notice = billing.lowBalanceNotice(userId, command && { name: command.name, price });
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
