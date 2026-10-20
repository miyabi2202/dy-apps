import { errorMessage } from '../core/errors';
import type { Heard } from '../core/prompt';
import {
  answerBudget,
  DOUYIN_CHAT_LIMIT,
  replyMessages,
  singleBudget,
  type ReplyLimits,
} from '../core/reply';
import {
  MENTION_ANSWER_SCHEMA,
  MESSAGE_SCHEMA,
  MESSAGES_SCHEMA,
  parseMentionAnswer,
  parseOthers,
} from '../core/mention-answer';
import type { UnpromptedReply } from '../core/reply-pick';
import type { ChatLine } from '../core/room-events';
import type { Billing } from './billing';
import type { PromptOptions } from './command';
import type { EventBus } from './event-bus';
import type { Outbox } from './outbox';
import { Pending } from './pending';
import type { AskModel, Log, UserTalk } from './ports';
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
  unprompted?: Heard;
  /**
   * Called, after the refund, when Claude said nothing: an @ that a room command's trigger took
   * («虾虾会生气吗» for 会唱xxx吗) is answered as usual then.
   */
  ifEmpty?: () => void;
}

export type { UnpromptedReply };

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
  ask: AskModel;
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
  /**
   * Told when, answering with the usual prompt, Claude found the asker asking for a command in
   * so many words (修改人设 for 「把你的人设改成小猫」): true when it took it from there (ran it, or
   * said they may not), so Claude's own reply isn't sent.
   */
  onCommandRequest?: (mention: Mention, name: string, args: string) => boolean;
  /**
   * Tells of each viewer it answered (`answered`), once the answer to them is sent: the asker, and
   * each of the others an answer @s who said something lately (found by nickname in the chat).
   */
  bus?: Pick<EventBus, 'emit'>;
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
  private readonly work = new Pending();
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
    this.drain();
    return true;
  }

  /** Resolves once Claude has answered every queued mention. */
  idle(): Promise<void> {
    return this.work.idle();
  }

  private drain(): void {
    if (this.busy) return;
    this.busy = true;
    this.work.track(this.answerAll());
  }

  private async answerAll(): Promise<void> {
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
    // What the bot says unprompted is one message: nobody asked for a long answer.
    const limits = mention.unprompted ? { ...this.limits, maxParts: 1 } : this.limits;
    try {
      const transcript = room.recentTranscript();
      const prompt = room.prompt(mention.template ?? promptTemplate(), {
        transcript: mention.pickTranscript?.(transcript) ?? transcript,
        history: mention.history,
        asker: mention.asker,
        question: mention.question,
        singleLength: singleBudget(mention.asker, limits),
        maxLength: answerBudget(mention.asker, limits),
        userHistory: mention.userId ? userTalk?.recent(mention.userId) : undefined,
        askerBalance: mention.userId ? this.options.billing?.balance(mention.userId) : undefined,
        unprompted: mention.unprompted,
      });
      log.debug('prompt', { prompt });
      const image = await room.screenshot(mention.alwaysScreenshot);
      const started = room.now();
      const { tools, maxTurns } = mention;
      // The usual prompt answers in MENTION_ANSWER_SCHEMA; a command's own prompt, as it says,
      // or in MESSAGE_SCHEMA (MESSAGES_SCHEMA when it may @ others too).
      const usual = mention.template === undefined;
      const schema = usual
        ? MENTION_ANSWER_SCHEMA
        : mention.jsonMessage
          ? mention.atOthers
            ? MESSAGES_SCHEMA
            : MESSAGE_SCHEMA
          : null;
      const raw = await (mention.ask ?? ask)({
        prompt,
        image,
        tools,
        maxTurns,
        ...(schema && { schema }),
      });
      log.info('claude answered', { answer: raw, ms: room.now() - started, image: !!image });
      const answer = schema ? parseMentionAnswer(raw).message : raw;
      if (usual) {
        const { command, args } = parseMentionAnswer(raw);
        if (command && this.options.onCommandRequest?.(mention, command, args)) {
          if (mention.userId) {
            const { asker: nickname, question } = mention;
            const asked = `（要调用指令 /${command}${args ? ` ${args}` : ''}）`;
            userTalk?.add(mention.userId, { nickname, question, answer: asked });
          }
          return;
        }
      }
      // Each of the others gets one message of their own, after the asker's. The usual prompt's
      // answer may have them too (「跟杨叔打个招呼」), and then says nothing to the asker.
      const others = usual || mention.atOthers ? parseOthers(raw) : [];
      const messages = usual && others.length ? [] : replyMessages(mention.asker, answer, limits);
      const single = { ...limits, maxParts: 1 };
      // The others are known by nickname only: whoever said something under it most lately.
      const chat = [...mention.history, ...room.recentChat()].reverse();
      const toOthers = others.flatMap(({ to, message }) =>
        replyMessages(to, message, single).map((text) => ({
          text,
          userId: chat.find((line) => line.nickname === to && line.userId)?.userId,
        })),
      );
      if (!messages.length && !toOthers.length) {
        log.warn('claude gave an empty answer', { asker: mention.asker });
        this.refund(mention);
        mention.ifEmpty?.();
        return;
      }
      // One refund however many of the parts fail.
      let refunded = false;
      const onFailed = () => {
        if (refunded) return;
        refunded = true;
        this.refund(mention);
      };
      // Each is told answered once the last message to them is sent, so their minute to answer
      // back doesn't run out while it waits to go out.
      const answered = (userId: string | undefined) =>
        userId === undefined ? undefined : () => this.options.bus?.emit('answered', { userId });
      messages.forEach((text, i) => {
        const last = i === messages.length - 1;
        outbox.push({
          kind: 'reply',
          text,
          onFailed,
          onSent: last ? answered(mention.userId) : undefined,
        });
      });
      for (const { text, userId } of toOthers) {
        outbox.push({ kind: 'reply', text, onFailed, onSent: answered(userId) });
      }
      if (others.length)
        log.info('at others', { asker: mention.asker, to: others.map((o) => o.to) });
      if (mention.userId) {
        const { asker: nickname, question } = mention;
        const said = [...messages, ...toOthers.map(({ text }) => text)].join(' ');
        userTalk?.add(mention.userId, { nickname, question, answer: said });
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
