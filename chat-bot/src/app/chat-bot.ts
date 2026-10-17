import { ChatHistory } from '../core/chat-history';
import { chatRecord, giftRecord } from '../core/chat-record';
import { parseCommand, type Command } from '../core/command';
import { isFromBot, questionFor, type BotIdentity } from '../core/mention';
import { buildPrompt } from '../core/prompt';
import {
  answerBudget,
  oneMessage,
  replyMessages,
  singleBudget,
  type ReplyLimits,
} from '../core/reply';
import type { ChatLine, IncomingChat } from '../core/room-events';
import type { Transcript } from '../core/transcript';
import type { Billing, Charge } from './billing';
import type { Outbox } from './outbox';
import type { AskClaude, Log, RoomEvents, RoomRecord, Screenshot } from './ports';

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
  /** The prompt; see buildPrompt for what it can fill in. */
  promptTemplate: string;
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
  /** User ids of the admins: their mentions are free, and only they can run commands. */
  admins?: ReadonlySet<string>;
  /** Who the bot plays, for `{{persona}}`; admins can change it with `/修改人设`. */
  persona?: string;
}

interface Mention {
  asker: string;
  /** Who paid for it, and how much, to give back if it can't be answered. */
  userId?: string;
  paid: number;
  question: string;
  history: ChatLine[];
}

/**
 * Remembers a room's recent chat and answers each @mention of the bot: the question and the
 * chat before it go to Claude, and the answer joins the outbox to be sent to the room. Claude
 * answers one mention at a time, in order, without waiting for earlier answers to go out. With
 * billing, a viewer who can't pay gets a fixed notice, put in the outbox straight away rather
 * than waiting behind the questions for Claude.
 *
 * An admin's mention starting with `/` is a command instead (`/修改人设 …`, `/修改收费 2`): it
 * takes effect at once and the bot confirms with a system message. Anyone else's is ignored.
 */
export class ChatBot {
  private readonly history: ChatHistory;
  private readonly pending: Mention[] = [];
  private busy = false;
  private readonly limits: ReplyLimits;
  private readonly maxPending: number;
  private readonly now: () => number;
  private persona: string;

  constructor(private readonly options: ChatBotOptions) {
    this.history = new ChatHistory(options.historySize ?? 100);
    this.persona = options.persona ?? '';
    this.limits = { maxLength: options.maxReplyLength ?? 49, maxParts: options.maxReplyParts ?? 5 };
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
    });
    events.connect();
  }

  stop(): void {
    this.options.events.close();
  }

  /** Resolves once Claude has answered every queued mention (or failed to). */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /**
   * Runs an admin's command, or charges the asker (admins are free) and queues the question, or
   * queues a notice when they can't pay.
   */
  private onMention(chat: IncomingChat, question: string): void {
    const { billing, log, outbox } = this.options;
    const { nickname: asker, userId } = chat;
    log.info('mention', { asker, userId, question });
    const admin = userId !== undefined && !!this.options.admins?.has(userId);
    const command = parseCommand(question);
    if (command) {
      if (admin) this.runCommand(asker, command);
      else log.info('command from a non-admin, ignored', { asker, userId, ...command });
      return;
    }
    const charge: Charge =
      admin || !billing ? { ok: true, paid: 0 } : billing.charge(userId, asker);
    if (!charge.ok) {
      log.info('balance too low', { asker, userId, balance: billing?.balance(userId) });
      if (charge.notify && billing) {
        const notice = billing.lowBalanceNotice(userId);
        outbox.push({
          kind: 'notice',
          text: oneMessage(asker, notice, this.limits.maxLength) ?? `@${asker} ${notice}`,
        });
      }
      return;
    }
    const mention = { asker, userId, paid: charge.paid, question, history: this.history.recent() };
    if (!this.enqueue(mention)) this.refund(mention);
  }

  /** Carries out an admin's command and tells them how it went, as a system message. */
  private runCommand(asker: string, command: Command): void {
    const { log, outbox } = this.options;
    const result = this.applyCommand(command);
    log.info('command', { asker, ...command, result });
    outbox.push({
      kind: 'system',
      text: oneMessage(asker, result, this.limits.maxLength) ?? `@${asker} ${result}`,
    });
  }

  /** What the bot says back about a command. */
  private applyCommand({ name, args }: Command): string {
    switch (name) {
      case '修改人设':
        if (!args) return '人设不能为空，用法：/修改人设 人设';
        this.persona = args;
        return '已处理修改人设请求';
      case '修改收费': {
        const { billing } = this.options;
        if (!/^\d+$/.test(args)) return '收费要写成钻石数，用法：/修改收费 2';
        if (!billing) return '这次运行没有开收费，改不了';
        billing.cost = Number(args);
        return '已处理修改收费请求';
      }
      default:
        return `没有指令「${name}」，可用的有：修改人设、修改收费`;
    }
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

  private refund(mention: Mention): void {
    if (!mention.userId || !mention.paid) return;
    this.options.billing?.refund(mention.userId, mention.paid);
    this.options.log.info('refunded', { asker: mention.asker, diamonds: mention.paid });
  }

  private async answer(mention: Mention): Promise<void> {
    const { ask, outbox, log, promptTemplate, transcript } = this.options;
    const prompt = buildPrompt(promptTemplate, {
      ...mention,
      singleLength: singleBudget(mention.asker, this.limits),
      maxLength: answerBudget(mention.asker, this.limits),
      transcript: transcript?.recent(this.options.transcriptMs ?? 5 * 60_000) ?? [],
      now: this.now(),
      chatDir: this.options.record?.dir,
      persona: this.persona,
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
    } catch (err) {
      log.error('could not answer mention', {
        asker: mention.asker,
        question: mention.question,
        error: err instanceof Error ? err.message : String(err),
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
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }
}
