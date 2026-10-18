import { errorMessage } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import {
  answerBudget,
  DOUYIN_CHAT_LIMIT,
  replyMessages,
  singleBudget,
  type ReplyLimits,
} from '../core/reply';
import type { ChatLine } from '../core/room-events';
import type { Billing } from './billing';
import type { PromptOptions } from './command';
import type { Outbox } from './outbox';
import type { AskClaude, Log, UserTalk } from './ports';
import type { RoomState } from './room-state';

/**
 * A question for Claude, paid for by `userId` unless they're an admin or it's free; a command's
 * own prompt may come with its PromptOptions.
 */
export interface Mention extends PromptOptions {
  asker: string;
  /** Who paid for it, and how much, to give back if it can't be answered. */
  userId?: string;
  paid: number;
  question: string;
  /** The chat as it was when they asked, not what came after. */
  history: ChatLine[];
  /** A command's own prompt template instead of the usual one. */
  template?: string;
  /** Not an @: the bot heard the asker talk to or about it, in the chat or on the stream. */
  unprompted?: 'chat' | 'speech';
}

/** Gives `mention`'s price back to whoever paid it, if anything was paid. */
export function refundMention(
  billing: Pick<Billing, 'refund'> | undefined,
  log: Log,
  { asker, userId, paid }: Pick<Mention, 'asker' | 'userId' | 'paid'>,
): void {
  if (!userId || !paid) return;
  billing?.refund(userId, paid);
  log.info('refunded', { asker, diamonds: paid });
}

export interface MentionAnswererOptions {
  ask: AskClaude;
  /** Where replies go to be sent, spaced out. */
  outbox: Pick<Outbox, 'push'>;
  /** What the room looks like now, for every prompt. */
  room: RoomState;
  log: Log;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Gives back what a mention cost when it can't be answered, and tells the prompt the asker's
   * balance. */
  billing?: Pick<Billing, 'refund' | 'balance'>;
  /** Each viewer's past exchanges with the bot: answers are added, and `{{userHistory}}` is
   * the asker's. */
  userTalk?: UserTalk;
  /** Douyin's chat length limit: the prompt asks for less, and longer replies are cut to it. */
  maxReplyLength?: number;
  /** A long answer goes out as up to this many messages, `@asker (1/3) …`. */
  maxReplyParts?: number;
  /** Mentions waiting for Claude beyond this are dropped, so a busy room can't pile up a
   * backlog nobody remembers asking. */
  maxPending?: number;
}

/**
 * Answers mentions: the question and the chat before it go to Claude, and the answer joins the
 * outbox to be sent to the room, split into numbered messages when it's long. Claude answers
 * one mention at a time, in order, without waiting for earlier answers to go out. A mention
 * that can't be answered (Claude failed, or said nothing, or Douyin refused the message) is
 * refunded.
 */
export class MentionAnswerer {
  private readonly pending: Mention[] = [];
  private busy = false;
  private readonly limits: ReplyLimits;
  private readonly maxPending: number;

  constructor(private readonly options: MentionAnswererOptions) {
    this.limits = {
      maxLength: options.maxReplyLength ?? DOUYIN_CHAT_LIMIT,
      maxParts: options.maxReplyParts ?? 5,
    };
    this.maxPending = options.maxPending ?? 20;
  }

  /** Queues a mention for Claude; false when the queue is full and it was dropped. */
  ask(mention: Mention): boolean {
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

  /** Resolves once Claude has answered every queued mention. */
  async idle(): Promise<void> {
    while (this.busy) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
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
    refundMention(this.options.billing, this.options.log, mention);
  }

  private async answer(mention: Mention): Promise<void> {
    const { ask, outbox, room, log, promptTemplate, userTalk } = this.options;
    try {
      const input = room.promptInput();
      const prompt = buildPrompt(mention.template ?? promptTemplate(), {
        ...input,
        transcript: mention.pickTranscript?.(input.transcript) ?? input.transcript,
        history: mention.history,
        asker: mention.asker,
        question: mention.question,
        singleLength: singleBudget(mention.asker, this.limits),
        maxLength: answerBudget(mention.asker, this.limits),
        userHistory: mention.userId ? userTalk?.recent(mention.userId) : undefined,
        askerBalance: mention.userId ? this.options.billing?.balance(mention.userId) : undefined,
        unprompted: mention.unprompted,
      });
      log.debug('prompt', { prompt });
      const image = await room.screenshot();
      const started = room.now();
      const { tools, maxTurns } = mention;
      const answer = await (mention.ask ?? ask)({ prompt, image, tools, maxTurns });
      log.info('claude answered', { answer, ms: room.now() - started, image: !!image });
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
}
