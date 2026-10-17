import { ChatHistory } from '../core/chat-history';
import { chatRecord, giftRecord } from '../core/chat-record';
import { parseCommand, type CommandCall } from '../core/command';
import { errorMessage } from '../core/errors';
import { isFromBot, questionFor, type BotIdentity } from '../core/mention';
import { buildPrompt } from '../core/prompt';
import {
  answerBudget,
  DOUYIN_CHAT_LIMIT,
  oneMessage,
  replyMessages,
  singleBudget,
  type ReplyLimits,
} from '../core/reply';
import type { ChatLine, Gift, IncomingChat } from '../core/room-events';
import { DEFAULT_TRANSCRIPT_WINDOW_MS, type Transcript } from '../core/transcript';
import type { Billing, Charge } from './billing';
import type { Command, CommandResult, Persona } from './commands';
import type { Outbox } from './outbox';
import type {
  Admins,
  AskClaude,
  BotTalk,
  Log,
  RoomEvents,
  RoomRecord,
  Screenshot,
  UserTalk,
} from './ports';

export interface ChatBotOptions {
  events: RoomEvents;
  bot: BotIdentity;
  ask: AskClaude;
  /** Where replies and notices go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  /** A JPEG of the live video, sent to Claude with each question. */
  screenshot?: Screenshot;
  /** What the streamer has said, for `{{transcript}}`. */
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  log: Log;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  now?: () => number;
  /** How many recent chats to remember and pass to Claude. */
  historySize?: number;
  /** Douyin's chat length limit: the prompt asks for less, and longer replies are cut to it. */
  maxReplyLength?: number;
  /** A long answer goes out as up to this many messages, `@asker (1/3) …`. */
  maxReplyParts?: number;
  /** Mentions waiting for Claude beyond this are dropped (and refunded), so a busy room can't
   * pile up a backlog nobody remembers asking. */
  maxPending?: number;
  /** Where the room's chat and gifts are recorded for Claude to read. */
  record?: RoomRecord;
  /** Charges for mentions from what viewers gift. Without it, mentions are free. */
  billing?: Billing;
  /** User ids of the admins: their mentions and commands are free, and only they can run the
   * admin-only commands. */
  admins?: Admins;
  /** Who the bot plays, for `{{persona}}`; commands may change it. */
  persona?: Persona;
  /** What a mention starting with `/` can run. */
  commands?: readonly Command[];
  /** Background on the room for `{{context}}`, read each time so edits apply at once. */
  context?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /** Each viewer's past exchanges with the bot: answers are added, and `{{userHistory}}` is
   * the asker's. */
  userTalk?: UserTalk;
  /** Told of every gift worth diamonds, e.g. to thank big givers. */
  onGift?: (gift: Gift) => void;
}

interface Mention {
  asker: string;
  /** Who paid for it, and how much, to give back if it can't be answered. */
  userId?: string;
  paid: number;
  question: string;
  history: ChatLine[];
  /** A command's own prompt template instead of the usual one. */
  template?: string;
}

/**
 * Remembers a room's recent chat and answers each @mention of the bot: the question and the
 * chat before it go to Claude, and the answer joins the outbox to be sent to the room. Claude
 * answers one mention at a time, in order, without waiting for earlier answers to go out. With
 * billing, a viewer who can't pay gets a fixed notice, put in the outbox straight away rather
 * than waiting behind the questions for Claude.
 *
 * A mention starting with `/` runs one of `commands` instead (`/修改人设 …`): paid for like a
 * question but at the command's own price, it takes effect at once and the bot says how it went
 * in a system message. Admin-only commands, and commands nobody has, are ignored from anyone but
 * an admin, unless they have commands of their own to be told about.
 */
export class ChatBot {
  private readonly history: ChatHistory;
  private readonly pending: Mention[] = [];
  private busy = false;
  /** Commands still running, like one waiting for Claude. */
  private readonly running = new Set<Promise<void>>();
  private readonly limits: ReplyLimits;
  private readonly maxPending: number;
  private readonly now: () => number;
  private readonly commands: ReadonlyMap<string, Command>;

  constructor(private readonly options: ChatBotOptions) {
    this.history = new ChatHistory(options.historySize ?? 100);
    this.commands = new Map((options.commands ?? []).map((command) => [command.name, command]));
    this.limits = {
      maxLength: options.maxReplyLength ?? DOUYIN_CHAT_LIMIT,
      maxParts: options.maxReplyParts ?? 5,
    };
    this.maxPending = options.maxPending ?? 20;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    const { events, log, record, billing } = this.options;
    events.onStatus((status, detail) => log.info(`dyhub ${status}`, detail ? { detail } : {}));
    events.onChat((chat) => {
      log.debug('chat', { ...chat });
      record?.add(chatRecord(chat));
      const { bot } = this.options;
      const question = isFromBot(chat, bot) ? null : questionFor(chat, bot);
      if (question !== null) this.onMention(chat, question);
      this.history.add(chat);
    });
    events.onGift((gift) => {
      record?.add(giftRecord(gift));
      if (gift.diamonds <= 0) return;
      billing?.credit(gift);
      log.info('gift', { ...gift, balance: billing?.balance(gift.userId) });
      this.options.onGift?.(gift);
    });
    events.connect();
  }

  stop(): void {
    this.options.events.close();
  }

  /** The room's recent chat, oldest first. */
  recentChat(): ChatLine[] {
    return this.history.recent();
  }

  /** Resolves once Claude has answered every queued mention, and every command has finished. */
  async idle(): Promise<void> {
    while (this.busy || this.running.size) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** Runs the command the mention gives, or charges the asker and queues the question. */
  private onMention(chat: IncomingChat, question: string): void {
    const { log } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = this.isAdmin(userId);
    const call = parseCommand(question);
    if (call) {
      const pending = this.onCommand(chat, call, admin);
      if (pending) {
        const run = pending.finally(() => this.running.delete(run));
        this.running.add(run);
      }
      return;
    }
    const charge = this.charge(chat, admin);
    if (!charge.ok) return;
    const mention = { asker, userId, paid: charge.paid, question, history: this.history.recent() };
    if (!this.enqueue(mention)) this.refund(mention);
  }

  private isAdmin(userId: string | undefined): boolean {
    return userId !== undefined && !!this.options.admins?.has(userId);
  }

  /**
   * Takes the price of a mention, or of `command`, from the asker, nothing from an admin; when
   * they can't pay, queues a notice and says so.
   */
  private charge(
    { nickname: asker, userId }: IncomingChat,
    admin: boolean,
    command?: Command,
  ): Charge {
    const { billing, log } = this.options;
    if (admin || !billing) return { ok: true, paid: 0 };
    const price = command?.price ?? billing.cost;
    const charge = billing.charge(userId, asker, price);
    if (charge.ok) return charge;
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
   * A command with its own prompt is queued for Claude like a mention. A promise while a command
   * that waits (on Claude, say) is still running.
   */
  private onCommand(
    chat: IncomingChat,
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
    const charge = this.charge(chat, admin, command);
    if (!charge.ok) return undefined;
    if (command.prompt) {
      const mention = {
        asker,
        userId,
        paid: charge.paid,
        question: args,
        history: this.history.recent(),
        template: command.prompt(),
      };
      log.info('command', { asker, userId, name, args, paid: charge.paid });
      if (!this.enqueue(mention)) this.refund(mention);
      return undefined;
    }
    const failed = (err: unknown): CommandResult => {
      log.error('command failed', {
        name,
        error: errorMessage(err),
      });
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
      text: oneMessage(asker, text, this.limits.maxLength) ?? `@${asker} ${text}`,
    });
  }

  /** Queues a mention for Claude; false when the queue is full and it was dropped. */
  private enqueue(mention: Mention): boolean {
    if (this.pending.length >= this.maxPending) {
      this.options.log.warn('too many waiting, dropping one', {
        asker: mention.asker,
        question: mention.question,
      });
      return false;
    }
    this.pending.push(mention);
    void this.drain();
    return true;
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let mention = this.pending.shift(); mention; mention = this.pending.shift()) {
        await this.answer(mention);
      }
    } finally {
      this.busy = false;
    }
  }

  private refund(mention: Pick<Mention, 'asker' | 'userId' | 'paid'>): void {
    if (!mention.userId || !mention.paid) return;
    this.options.billing?.refund(mention.userId, mention.paid);
    this.options.log.info('refunded', { asker: mention.asker, diamonds: mention.paid });
  }

  private async answer(mention: Mention): Promise<void> {
    const { ask, outbox, log, promptTemplate, transcript, userTalk } = this.options;
    const prompt = buildPrompt(mention.template ?? promptTemplate(), {
      ...mention,
      singleLength: singleBudget(mention.asker, this.limits),
      maxLength: answerBudget(mention.asker, this.limits),
      transcript:
        transcript?.recent(this.options.transcriptMs ?? DEFAULT_TRANSCRIPT_WINDOW_MS) ?? [],
      now: this.now(),
      chatDir: this.options.record?.dir,
      persona: this.options.persona?.value,
      context: this.options.context?.(),
      botTalk: this.options.botTalk?.recent(),
      userHistory: mention.userId ? userTalk?.recent(mention.userId) : undefined,
    });
    log.debug('prompt', { prompt });
    try {
      const image = await this.screenshot();
      const started = this.now();
      const answer = await ask({ prompt, image });
      log.info('claude answered', { answer, ms: this.now() - started, image: !!image });
      const messages = replyMessages(mention.asker, answer, this.limits);
      if (!messages.length) {
        log.warn('claude gave an empty answer', { asker: mention.asker });
        this.refund(mention);
        return;
      }
      // One refund however many of the parts fail.
      let refunded = false;
      const onFailed = () => {
        if (refunded) return;
        refunded = true;
        this.refund(mention);
      };
      for (const text of messages) outbox.push({ kind: 'reply', text, onFailed });
      if (mention.userId) {
        const { asker: nickname, question } = mention;
        userTalk?.add(mention.userId, { nickname, question, answer: messages.join(' ') });
      }
    } catch (err) {
      log.error('could not answer mention', {
        asker: mention.asker,
        question: mention.question,
        error: errorMessage(err),
      });
      this.refund(mention);
    }
  }

  /** The live video, or nothing when there's no screenshot to be had: answering goes on. */
  private async screenshot(): Promise<Uint8Array | undefined> {
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', {
        error: errorMessage(err),
      });
      return undefined;
    }
  }
}
