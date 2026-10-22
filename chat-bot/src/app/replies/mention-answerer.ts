import { errorMessage } from '../../core/errors';
import type { Heard } from '../../core/prompts/prompt';
import {
  answerBudget,
  DOUYIN_CHAT_LIMIT,
  replyMessages,
  singleBudget,
} from '../../core/replies/reply';
import {
  MENTION_ANSWER_SCHEMA,
  MESSAGE_SCHEMA,
  MESSAGES_SCHEMA,
  parseMentionAnswer,
  parseOthers,
} from '../../core/replies/mention-answer';
import type { UnpromptedReply } from '../../core/replies/reply-pick';
import type { ChatLine } from '../../core/chat/room-events';
import { done, failed, type Command, type PromptOptions } from '../commands/command';
import type { EventBus } from '../event-bus';
import type { Outbox } from './outbox';
import { Pending } from '../pending';
import type { Admins, AskModel, BotTools, Log, UserTalk } from '../ports';
import type { RoomState } from '../room/room-state';

/** A question for Claude; a command's own prompt may come with its PromptOptions. */
export interface Mention extends PromptOptions {
  asker: string;
  /** Who asked: their talk record, and whom the answer tells `answered`. */
  userId?: string;
  question: string;
  /** The chat as it was when they asked, not what came after. */
  history: ChatLine[];
  /** A command's own prompt template instead of the usual one. */
  template?: string;
  /** What a room command says as it is: sent to the asker without asking a model. */
  fixedReply?: string;
  /** Not an @: the bot heard the asker talk to or about it, in the chat or on the stream. */
  unprompted?: Heard;
  /**
   * Called when Claude said nothing: an @ that a room command's trigger took
   * («虾虾会生气吗» for 会唱xxx吗) is answered as usual then.
   */
  ifEmpty?: () => void;
}

export type { UnpromptedReply };

/** The badges by `mention`'s asker's name, from their latest chat line it saw (none for speech). */
function badgesOf({ userId, history }: Pick<Mention, 'userId' | 'history'>): readonly string[] {
  if (!userId) return [];
  return [...history].reverse().find((line) => line.userId === userId)?.badges ?? [];
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
  /** Each viewer's past exchanges with the bot: answers are added, and `{{userHistory}}` is
   * the asker's. */
  userTalk?: UserTalk;
  /** Douyin's chat length limit: the prompt asks for less, and longer replies are split to fit. */
  maxReplyLength?: number;
  /**
   * Told when, answering with the usual prompt, Claude found the asker asking for a command in
   * so many words (自动谢礼 for 「以后 100 钻以下的礼物不用谢了」): true when it took it from there (ran it, or
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
  /**
   * The bot's own tools (identify_song…), which Claude may call while answering with the usual
   * prompt; never for a command's own prompt. Each question gets its own session, closed when
   * the answer is done.
   */
  tools?: BotTools;
  /** Who the admins are: only their questions get the admin-only tools. */
  admins?: Admins;
}

/** An answer that may call tools can run longer than one that can't. */
const TOOLS_TIMEOUT_MS = 300_000;

/**
 * Answers mentions: the question and the chat before it go to Claude, and the answer joins the
 * outbox to be sent to the room, split into numbered messages when it's long. Claude answers
 * one mention at a time, in order, without waiting for earlier answers to go out.
 */
export class MentionAnswerer {
  private readonly pending: Mention[] = [];
  private busy = false;
  private readonly work = new Pending();
  private readonly maxLength: number;
  private readonly maxPending: number;

  constructor(private readonly options: MentionAnswererOptions) {
    this.maxLength = options.maxReplyLength ?? DOUYIN_CHAT_LIMIT;
    this.maxPending = options.maxPending ?? 20;
  }

  /** `/最大回复条数 3`: what the bot says is split into at most that many messages (1 to 10). */
  commands(): Command[] {
    return [
      {
        name: '最大回复条数',
        adminOnly: true,
        run: (args) => {
          if (!/^\d+$/.test(args) || Number(args) < 1 || Number(args) > 10)
            return failed('条数要写成 1 到 10 的整数，用法：/最大回复条数 3');
          const { room, log } = this.options;
          room.maxReplyParts = Number(args);
          log.info('reply parts', { maxParts: room.maxReplyParts });
          return done('已处理最大回复条数请求');
        },
      },
    ];
  }

  /**
   * Queues a mention for Claude, dropped when the queue is full. A `fixedReply` isn't queued:
   * it's sent at once, with no model asked.
   */
  ask(mention: Mention): void {
    if (mention.fixedReply !== undefined) {
      this.sendFixed(mention, mention.fixedReply);
      return;
    }
    if (this.pending.length >= this.maxPending) {
      this.options.log.warn('too many waiting, dropping one', {
        asker: mention.asker,
        question: mention.question,
      });
      return;
    }
    this.pending.push(mention);
    this.drain();
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

  /** Sends `text` to the asker as a reply, like an answer. */
  private sendFixed(mention: Mention, text: string): void {
    const { outbox, log, userTalk, bus } = this.options;
    const limits = this.options.room.replyLimits(this.maxLength);
    const messages = replyMessages(mention.asker, text, limits);
    if (!messages.length) {
      log.warn('a fixed reply is empty', { asker: mention.asker });
      return;
    }
    const { userId } = mention;
    messages.forEach((message, i) => {
      const last = i === messages.length - 1;
      outbox.push({
        kind: 'reply',
        text: message,
        onSent: last && userId !== undefined ? () => bus?.emit('answered', { userId }) : undefined,
      });
    });
    if (userId) {
      const { asker: nickname, question } = mention;
      userTalk?.add(userId, { nickname, question, answer: messages.join(' ') });
    }
  }

  private async answer(mention: Mention): Promise<void> {
    const { ask, outbox, room, log, promptTemplate, userTalk } = this.options;
    const limits = this.options.room.replyLimits(this.maxLength);
    // The usual prompt answers in MENTION_ANSWER_SCHEMA; a command's own prompt, as it says,
    // or in MESSAGE_SCHEMA (MESSAGES_SCHEMA when it may @ others too).
    const usual = mention.template === undefined;
    // Only the usual prompt's answer gets the tools: a command has its own way to do its job.
    const session =
      (usual &&
        this.options.tools?.open({
          asker: mention.asker,
          userId: mention.userId,
          question: mention.question,
          admin: mention.userId !== undefined && !!this.options.admins?.has(mention.userId),
        })) ||
      null;
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
        askerBadges: badgesOf(mention),
        unprompted: mention.unprompted,
      });
      log.debug('prompt', { prompt });
      const image = await room.screenshot(mention.alwaysScreenshot);
      const started = room.now();
      const { tools, maxTurns } = mention;
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
        ...(session && { botTools: session.access, timeoutMs: TOOLS_TIMEOUT_MS }),
      });
      const used = session?.used() ?? [];
      log.info('claude answered', {
        answer: raw,
        ms: room.now() - started,
        image: !!image,
        ...(used.length && { tools: used }),
      });
      const answer = schema ? parseMentionAnswer(raw).message : raw;
      if (usual) {
        const { command, args } = parseMentionAnswer(raw);
        if (command && session?.replaces(command)) {
          // Claude already did that job with its tool and wrote the reply: send it.
          log.info('command request ignored, the tool did it', { command });
        } else if (command && this.options.onCommandRequest?.(mention, command, args)) {
          if (mention.userId) {
            const { asker: nickname, question } = mention;
            const asked = `（要调用指令 /${command}${args ? ` ${args}` : ''}）`;
            userTalk?.add(mention.userId, { nickname, question, answer: asked });
          }
          return;
        }
      }
      // Each of the others gets a message of their own, after the asker's. The usual prompt's
      // answer may have them too (「跟杨叔打个招呼」), and then says nothing to the asker.
      const others = usual || mention.atOthers ? parseOthers(raw) : [];
      const messages = usual && others.length ? [] : replyMessages(mention.asker, answer, limits);
      // The others are known by nickname only: whoever said something under it most lately.
      const chat = [...mention.history, ...room.recentChat()].reverse();
      const toOthers = others.flatMap(({ to, message }) =>
        replyMessages(to, message, limits).map((text) => ({
          text,
          userId: chat.find((line) => line.nickname === to && line.userId)?.userId,
        })),
      );
      if (!messages.length && !toOthers.length) {
        // The usual prompt may say nothing when nothing needs saying (a 「谢谢」 that ends it).
        if (usual) log.info('claude skipped', { asker: mention.asker, question: mention.question });
        else log.warn('claude gave an empty answer', { asker: mention.asker });
        mention.ifEmpty?.();
        return;
      }
      // Each is told answered once the last message to them is sent, so their minute to answer
      // back doesn't run out while it waits to go out.
      const answered = (userId: string | undefined) =>
        userId === undefined ? undefined : () => this.options.bus?.emit('answered', { userId });
      messages.forEach((text, i) => {
        const last = i === messages.length - 1;
        outbox.push({
          kind: 'reply',
          text,
          onSent: last ? answered(mention.userId) : undefined,
        });
      });
      for (const { text, userId } of toOthers) {
        outbox.push({ kind: 'reply', text, onSent: answered(userId) });
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
    } finally {
      session?.close();
    }
  }
}
