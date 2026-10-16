import type { DyhubClient, DyhubCommentEvent } from '@dy-apps/services';
import { ChatHistory, chatLineFrom, type ChatLine } from './chat-history';
import type { ChatLog } from './chat-log';
import type { AskClaude } from './claude';
import type { Outbox } from './outbox';
import { isFromBot, questionFor, type BotIdentity } from './mention';
import { buildPrompt } from './prompt';
import { answerBudget, oneMessage, replyMessages, singleBudget, type ReplyLimits } from './reply';
import type { Transcript } from './transcript';
import type { Wallet } from './wallet';

/** The logger methods the bot uses; a winston logger fits. */
export interface BotLog {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

export interface ChatBotOptions {
  client: Pick<DyhubClient, 'onComment' | 'onGift' | 'onStatus' | 'connect' | 'close'>;
  bot: BotIdentity;
  ask: AskClaude;
  /** Where replies and notices go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  /** A JPEG of the live video, sent to Claude with each question. */
  screenshot?: () => Promise<Uint8Array>;
  /** What the streamer has said, for `{{transcript}}`. */
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  log: BotLog;
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
  chatLog?: ChatLog;
  /** Viewers' balances from their gifts. Without one, mentions are free. */
  wallet?: Wallet;
  /** Diamonds one @mention costs. */
  cost?: number;
  /** Tell a viewer their balance is too low at most this often. */
  noticeCooldownMs?: number;
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
 * answers one mention at a time, in order, without waiting for earlier answers to go out. With a
 * wallet, each mention costs `cost` diamonds from what the asker has gifted, given back if it
 * can't be answered; a viewer who can't pay gets a fixed notice, put in the outbox straight away
 * rather than waiting behind the questions for Claude.
 */
export class ChatBot {
  private readonly history: ChatHistory;
  private readonly pending: Mention[] = [];
  /** When each viewer was last told their balance is too low. */
  private readonly noticedAt = new Map<string, number>();
  private busy = false;
  private readonly limits: ReplyLimits;
  private readonly maxPending: number;
  private readonly now: () => number;
  private readonly cost: number;

  constructor(private readonly options: ChatBotOptions) {
    this.history = new ChatHistory(options.historySize ?? 100);
    this.limits = { maxLength: options.maxReplyLength ?? 49, maxParts: options.maxReplyParts ?? 5 };
    this.maxPending = options.maxPending ?? 20;
    this.now = options.now ?? Date.now;
    this.cost = options.cost ?? 1;
  }

  start(): void {
    const { client, log } = this.options;
    client.onStatus((status, detail) => log.info(`dyhub ${status}`, detail ? { detail } : {}));
    client.onComment((event) => {
      const line = chatLineFrom(event);
      log.debug('chat', { ...line });
      this.options.chatLog?.add({
        type: 'chat',
        sender: line.nickname,
        userId: line.userId,
        text: line.content,
      });
      const { bot } = this.options;
      const question = isFromBot(event, bot) ? null : questionFor(event, bot);
      if (question !== null) this.onMention(event, question);
      this.history.add(line);
    });
    client.onGift((event, newGifts) => {
      if (!event.user || newGifts <= 0) return;
      const diamonds = newGifts * (event.data.diamondCount ?? 0);
      this.options.chatLog?.add({
        type: 'gift',
        sender: event.user.nickname,
        userId: event.user.id,
        gift: { name: event.data.giftName ?? '礼物', count: newGifts, diamonds },
      });
      if (diamonds <= 0) return;
      this.options.wallet?.credit(event.user.id, event.user.nickname, diamonds);
      log.info('gift', {
        userId: event.user.id,
        nickname: event.user.nickname,
        gift: event.data.giftName,
        count: newGifts,
        diamonds,
        balance: this.options.wallet?.balance(event.user.id),
      });
    });
    client.connect();
  }

  stop(): void {
    this.options.client.close();
  }

  /** Resolves once Claude has answered every queued mention (or failed to). */
  async idle(): Promise<void> {
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** Charges the asker and queues the question, or queues a notice when they can't pay. */
  private onMention(event: DyhubCommentEvent, question: string): void {
    const { wallet, log } = this.options;
    const asker = event.user?.nickname ?? '匿名';
    const userId = event.user?.id;
    log.info('mention', { asker, userId, question });
    let paid = 0;
    if (wallet && this.cost > 0) {
      if (!userId || !wallet.spend(userId, asker, this.cost)) {
        log.info('balance too low', { asker, userId, balance: userId && wallet.balance(userId) });
        this.notifyBalanceTooLow(asker, userId);
        return;
      }
      paid = this.cost;
    }
    const mention = { asker, userId, paid, question, history: this.history.recent() };
    if (!this.enqueue(mention)) this.refund(mention);
  }

  private notifyBalanceTooLow(asker: string, userId: string | undefined): void {
    const key = userId ?? asker;
    const last = this.noticedAt.get(key);
    const now = this.now();
    const cooldownMs = this.options.noticeCooldownMs ?? 60_000;
    if (last !== undefined && now - last < cooldownMs) return;
    this.noticedAt.set(key, now);
    const notice = `你的余额不足，每次@需要${this.cost}钻（${Math.round(cooldownMs / 1000)}秒内只提醒一次）`;
    this.options.outbox.push({
      kind: 'notice',
      text: oneMessage(asker, notice, this.limits.maxLength) ?? `@${asker} ${notice}`,
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

  private refund(mention: Mention): void {
    if (!mention.userId || !mention.paid) return;
    this.options.wallet?.refund(mention.userId, mention.paid);
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
      chatDir: this.options.chatLog?.dir,
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
