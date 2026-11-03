import type { Streamer } from '../commands/streamer-admin';
import { errorMessage } from '../../core/errors';
import { fillTemplate } from '../../core/prompts/template';
import { parseJsonObject } from '../../core/replies/json-answer';
import {
  chattersOf,
  digestText,
  memoryChangesOf,
  NOTE_CHANGES_SCHEMA,
  parseRecordLine,
  ROOM_CHANGES_SCHEMA,
  summaryOf,
  type Chatter,
  type RecordLine,
} from '../../core/memory/chat-digest';
import {
  memoryLength,
  NOTE_LIMIT,
  STREAMER_NOTE_LIMIT,
  type Change,
  type RoomMemory,
  type Target,
} from '@dy-apps/room-memory';
import { termKey } from '@dy-apps/to-learn';
import type { AskModel, BotFeedback, FeedbackList, Log, Thoughts, ToLearnList } from '../ports';

export interface RememberChatOptions {
  /** Claude, asked once per batch of viewers and once about the whole stream. */
  ask: AskModel;
  memory: Pick<
    RoomMemory,
    'roomText' | 'noteText' | 'entries' | 'limitOf' | 'changeAll' | 'addStreamSummary'
  >;
  /** The chat record's files that may hold lines from `sinceMs` on, as text, oldest first. */
  readSince: (sinceMs: number) => string[];
  /** Up to when the record was read into memory last time; set once a run is through. */
  mark: { get(): number | undefined; set(ms: number): void };
  /** The prompt about viewers' notes (remember-notes.md), read each time. */
  notesPrompt: () => string;
  /** The prompt about the room's memory and the streamer's note (remember-room.md), read each time. */
  roomPrompt: () => string;
  /**
   * The bot's own thoughts after the stream (remember-thoughts.md asks for them, in `persona`'s
   * voice); none without it.
   */
  thoughts?: {
    prompt: () => string;
    /** Who the bot plays in the room, as every prompt has it. */
    persona: () => string;
    store: Pick<Thoughts, 'recent' | 'add'>;
  };
  /**
   * What the stream had that the bot didn't understand, for `pnpm browse --todo` to learn
   * (remember-to-learn.md asks for it); nothing without it.
   */
  toLearn?: {
    prompt: () => string;
    list: ToLearnList;
    /** The terms the knowledge base has (titles and aliases): not asked about again. */
    known: () => readonly string[];
  };
  /**
   * What the audience clearly said the bot got wrong in the stream (remember-feedback.md asks for
   * it), sorted into what needs the code, a prompt or the knowledge base changed, onto the feedback
   * list; a knowledge one goes on the to-learn list too, with `toLearn`. Nothing without it.
   */
  feedback?: {
    prompt: () => string;
    list: FeedbackList;
    /** The room the stream was in, for the list. */
    roomId: string;
  };
  /** Who the streamer is: their note is about the whole stream, not a viewer's. */
  streamer: Pick<Streamer, 'id'>;
  /** The bot's own account, whose lines aren't a viewer's. */
  bot: { name: string; id?: string };
  /** A 私密 room, whose viewers can't be told apart: no viewer notes there. */
  isPrivate: () => boolean;
  log: Log;
  now?: () => number;
  /** The day `ms` falls on, `YYYY-MM-DD`, in the room's time zone; the machine's by default. */
  dayOf?: (ms: number) => string;
  /** How many chats a viewer must have sent since last time to get their note looked at. */
  minChats?: number;
  /** How many viewers one question is about. */
  batchSize?: number;
  /** How far back the first run reads, with no mark yet. */
  firstRunMs?: number;
  /**
   * How long one question may take: 10 minutes by default, more than an answer in the room gets,
   * since a few days' chat (a thousand lines and more) is a lot to read and nobody waits on it.
   */
  timeoutMs?: number;
}

/** How full `target`'s file is, like `994/1000`, for the prompts to say how much room is left. */
function usage(
  memory: Pick<RoomMemory, 'noteText' | 'roomText' | 'limitOf'>,
  target: Target,
): string {
  const text = target.scope === 'room' ? memory.roomText() : memory.noteText(target.userId);
  return `${memoryLength(text)}/${memory.limitOf(target)}`;
}

/**
 * The entries of `target`'s file for a prompt, each with the day it was written when it's known:
 * `（2026-10-30 记）`, or `（2026-10-30 你记）` for one this reading wrote itself, which it may
 * rewrite (see the room's policy in @dy-apps/room-memory).
 */
function shown(memory: Pick<RoomMemory, 'entries'>, target: Target): string {
  const entries = memory
    .entries(target)
    .map(({ text, at, by }) => (at ? `${text}（${at} ${by === 'chat' ? '你' : ''}记）` : text));
  return entries.join('\n§\n') || '（无）';
}

/** How many of its earlier thoughts the bot sees when it thinks about a stream. */
const THOUGHTS_SHOWN_TO_REFLECT = 12;

/** At most this many thoughts a stream. */
const MAX_THOUGHTS = 3;

const THOUGHTS_SCHEMA = {
  type: 'object',
  properties: {
    thoughts: {
      type: 'array',
      items: { type: 'string', description: '你自己的一个想法，一句话' },
      description: '这场直播之后你自己的想法，0 到 3 条',
    },
  },
  required: ['thoughts'],
  additionalProperties: false,
} as const;

/** The thoughts in an answer: its strings, trimmed, at most MAX_THOUGHTS. */
function thoughtsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_THOUGHTS);
}

/** At most this many things to learn a stream. */
const MAX_TO_LEARN = 5;

const TO_LEARN_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string', description: '在抖音上搜的词，短' },
          question: { type: 'string', description: '想弄清楚的问题，一句话，不看上下文也懂' },
        },
        required: ['term', 'question'],
        additionalProperties: false,
      },
      description: '这场直播里没懂、拿不准的东西，0 到 5 条',
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** The items in an answer: those with a term, trimmed. */
function toLearnOf(value: unknown): { term: string; question: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const { term, question } = (entry ?? {}) as Record<string, unknown>;
    if (typeof term !== 'string' || !term.trim()) return [];
    return [{ term: term.trim(), question: typeof question === 'string' ? question.trim() : '' }];
  });
}

/** At most this many things the audience said the bot got wrong, a stream. */
const MAX_FEEDBACK = 5;

const FEEDBACK_KINDS = ['program', 'prompt', 'knowledge'] as const;

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: FEEDBACK_KINDS,
            description: '改程序、改提示词还是改知识库',
          },
          time: { type: 'string', description: '你那句话的时间，HH:MM:SS' },
          botSaid: { type: 'string', description: '你说的那句，照抄' },
          feedback: { type: 'string', description: '观众或主播的反应，照抄原话，带上是谁说的' },
          problem: { type: 'string', description: '错在哪，一句话' },
          fix: { type: 'string', description: '该怎么改，一句话' },
          term: {
            type: 'string',
            description: 'knowledge 才写：要在抖音上查的词；别的类写空字符串',
          },
          question: {
            type: 'string',
            description: 'knowledge 才写：想弄清楚的问题；别的类写空字符串',
          },
        },
        required: ['kind', 'time', 'botSaid', 'feedback', 'problem', 'fix', 'term', 'question'],
        additionalProperties: false,
      },
      description: '观众明确说你做错、说得不对或不合适的地方，0 到 5 条',
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

/** The items in an answer: those of a known kind with a problem, trimmed, at most MAX_FEEDBACK. */
function feedbackOf(value: unknown): (BotFeedback & { term: string; question: string })[] {
  if (!Array.isArray(value)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  return value
    .flatMap((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const kind = FEEDBACK_KINDS.find((k) => k === item.kind);
      const problem = str(item.problem);
      if (!kind || !problem) return [];
      return [
        {
          kind,
          time: str(item.time),
          botSaid: str(item.botSaid),
          feedback: str(item.feedback),
          problem,
          fix: str(item.fix),
          term: str(item.term),
          question: str(item.question),
        },
      ];
    })
    .slice(0, MAX_FEEDBACK);
}

/** What one run did. */
export interface RememberResult {
  lines: number;
  viewers: number;
  changes: number;
  failed: number;
  /** How many thoughts of its own the bot had about the stream. */
  thoughts: number;
  /** How many things it put on the to-learn list. */
  toLearn: number;
  /** How many things the audience said it got wrong. */
  feedback: number;
}

/**
 * Reads the room's chat record since last time into what the bot remembers: each regular's
 * note.md from what they said themselves, and the room's memory.md and the streamer's note from
 * the whole stream. Claude says what to change, in the same add / replace / remove form as
 * update_memory, and each change goes through the same checks (the limits); one that
 * fails is skipped. The mark moves on only when every question was answered, so a failed run is
 * read again next time. Then, with `thoughts`, the bot says what it made of the stream itself (see
 * reflect); a failure there is only logged, since reading it all again for that would add the
 * stream's summary twice. The same goes for `toLearn`: what of the stream it didn't understand,
 * put on the to-learn list.
 */
export class RememberChat {
  constructor(private readonly options: RememberChatOptions) {}

  async run(): Promise<RememberResult> {
    const { mark, readSince, log, now = Date.now, firstRunMs = 12 * 3_600_000 } = this.options;
    const since = mark.get() ?? now() - firstRunMs;
    const lines = readSince(since)
      .flatMap((text) => text.split(/\r?\n/))
      .flatMap((line) => parseRecordLine(line) ?? [])
      .filter((line) => line.ms > since);
    const result: RememberResult = {
      lines: lines.length,
      viewers: 0,
      changes: 0,
      failed: 0,
      thoughts: 0,
      toLearn: 0,
      feedback: 0,
    };
    if (!lines.length) {
      log.info('nothing new to remember', { since });
      return result;
    }
    log.info('remembering', { since, lines: lines.length });
    if (!this.options.isPrivate()) await this.notes(lines, result);
    const summary = await this.room(lines, result);
    if (summary !== null) {
      await this.reflect(lines, summary, result);
      await this.wonder(lines, summary, result);
      await this.lookBack(lines, summary, result);
    }
    if (!result.failed) mark.set(Math.max(...lines.map((line) => line.ms)));
    log.info('remembered', { ...result });
    return result;
  }

  /** The viewers who said enough, a batch at a time. */
  private async notes(lines: readonly RecordLine[], result: RememberResult): Promise<void> {
    const { bot, streamer, minChats = 5, batchSize = 8 } = this.options;
    const exclude = new Set([bot.id, streamer.id()].filter((id): id is string => !!id));
    const chatters = chattersOf(
      lines.filter((line) => line.sender !== bot.name),
      { minChats, exclude },
    );
    result.viewers = chatters.length;
    for (let i = 0; i < chatters.length; i += batchSize) {
      await this.noteBatch(chatters.slice(i, i + batchSize), result);
    }
  }

  private async noteBatch(batch: readonly Chatter[], result: RememberResult): Promise<void> {
    const { memory, notesPrompt, log } = this.options;
    const viewers = batch
      .map(({ userId, nickname, lines }) =>
        [
          `### ${nickname}（userId: ${userId}）`,
          `现在记着的（已用 ${usage(memory, { scope: 'note', userId })} 字）：`,
          shown(memory, { scope: 'note', userId }),
          '这场 TA 自己发的弹幕：',
          digestText(lines, { maxChars: 3000 }),
        ].join('\n'),
      )
      .join('\n\n');
    const answer = await this.ask(
      fillTemplate(notesPrompt(), { viewers, noteLimit: NOTE_LIMIT }, { fillWhen: 'present' }),
      NOTE_CHANGES_SCHEMA,
      'notes',
    );
    if (answer === null) {
      result.failed++;
      return;
    }
    const notes = Array.isArray(answer.notes) ? answer.notes : [];
    for (const note of notes) {
      const { userId, changes } = (note ?? {}) as Record<string, unknown>;
      // Only the viewers asked about: an id the model made up writes nowhere.
      if (!batch.some((chatter) => chatter.userId === userId) || typeof userId !== 'string') {
        if (userId !== undefined)
          log.warn('remember named a viewer it was not asked about', { userId });
        continue;
      }
      result.changes += this.apply({ scope: 'note', userId }, memoryChangesOf(changes));
    }
  }

  /**
   * The room's memory and the streamer's note, from the whole stream; the stream's summary
   * (empty when Claude gave none), or null when Claude couldn't be asked.
   */
  private async room(lines: readonly RecordLine[], result: RememberResult): Promise<string | null> {
    const { memory, roomPrompt, log } = this.options;
    const streamer = this.options.streamer.id();
    const answer = await this.ask(
      fillTemplate(
        roomPrompt(),
        {
          memory: shown(memory, { scope: 'room' }),
          roomUsed: usage(memory, { scope: 'room' }),
          streamerNote: streamer ? shown(memory, { scope: 'note', userId: streamer }) : '（无）',
          streamerUsed: streamer
            ? usage(memory, { scope: 'note', userId: streamer })
            : `0/${STREAMER_NOTE_LIMIT}`,
          digest: digestText(lines, { maxChars: 60_000 }),
        },
        { fillWhen: 'present' },
      ),
      ROOM_CHANGES_SCHEMA,
      'room',
    );
    if (answer === null) {
      result.failed++;
      return null;
    }
    result.changes += this.apply({ scope: 'room' }, memoryChangesOf(answer.room));
    if (streamer) {
      result.changes += this.apply(
        { scope: 'note', userId: streamer },
        memoryChangesOf(answer.streamer),
      );
    }
    const summary = summaryOf(answer.summary);
    if (summary) {
      memory.addStreamSummary(this.daysOf(lines), summary);
      log.info('stream summarised', { chars: [...summary].length });
    }
    return summary;
  }

  /**
   * What the bot itself made of the stream, in its persona's voice: what it found funny, what it
   * wants to ask next time, what it now thinks. It sees what it thought after the last streams, so
   * a thought can change, and it may have none.
   */
  private async reflect(
    lines: readonly RecordLine[],
    summary: string,
    result: RememberResult,
  ): Promise<void> {
    const { thoughts, log } = this.options;
    if (!thoughts) return;
    const answer = await this.ask(
      fillTemplate(
        thoughts.prompt(),
        {
          persona: thoughts.persona() || '（无）',
          thoughts: thoughts.store.recent(THOUGHTS_SHOWN_TO_REFLECT) || '（无）',
          summary: summary || '（无）',
          digest: digestText(lines, { maxChars: 30_000 }),
        },
        { fillWhen: 'present' },
      ),
      THOUGHTS_SCHEMA,
      'thoughts',
    );
    const entries = thoughtsOf(answer?.thoughts);
    if (!entries.length) return;
    thoughts.store.add(this.daysOf(lines), entries);
    result.thoughts = entries.length;
    log.info('thought about the stream', { thoughts: entries });
  }

  /**
   * What in the stream the bot didn't understand or wasn't sure of, about Douyin and live rooms in
   * general (a gift, a game, a 梗), never about someone: added to the to-learn list, unless the
   * knowledge base or the list already has it. A failure is only logged, like reflect's.
   */
  private async wonder(
    lines: readonly RecordLine[],
    summary: string,
    result: RememberResult,
  ): Promise<void> {
    const { toLearn, log } = this.options;
    if (!toLearn) return;
    const known = toLearn.known();
    const answer = await this.ask(
      fillTemplate(
        toLearn.prompt(),
        {
          known: known.join('、') || '（无）',
          open: toLearn.list.open().join('、') || '（无）',
          summary: summary || '（无）',
          digest: digestText(lines, { maxChars: 30_000 }),
        },
        { fillWhen: 'present' },
      ),
      TO_LEARN_SCHEMA,
      'to-learn',
    );
    const wanted = toLearnOf(answer?.items);
    if (!wanted.length) return;
    const keys = new Set(known.map(termKey));
    const from = `直播 ${this.daysOf(lines)}`;
    const added = toLearn.list.add(
      wanted.map((item) => ({ ...item, from })),
      { known: (term) => keys.has(termKey(term)), max: MAX_TO_LEARN },
    );
    result.toLearn = added.length;
    if (added.length) log.info('to learn', { items: added.map(({ term }) => term) });
  }

  /**
   * What the audience clearly said the bot got wrong in the stream (not a joke at it, not what the
   * bot itself thinks it could have done better), each sorted into a code, prompt or knowledge
   * fix: onto the feedback list, and a knowledge one onto the to-learn list too, so `pnpm browse
   * --todo` looks it up and the review corrects the entry. A failure is only logged, like reflect's.
   */
  private async lookBack(
    lines: readonly RecordLine[],
    summary: string,
    result: RememberResult,
  ): Promise<void> {
    const { feedback, toLearn, bot, log } = this.options;
    if (!feedback) return;
    // Only a stream the bot said something in.
    if (!lines.some((line) => line.sender === bot.name)) return;
    const answer = await this.ask(
      fillTemplate(
        feedback.prompt(),
        {
          botName: bot.name,
          summary: summary || '（无）',
          digest: digestText(lines, { lineChars: 200, maxChars: 40_000 }),
        },
        { fillWhen: 'present' },
      ),
      FEEDBACK_SCHEMA,
      'feedback',
    );
    const items = feedbackOf(answer?.items);
    if (!items.length) return;
    const day = this.daysOf(lines);
    feedback.list.add(
      feedback.roomId,
      day,
      items.map(({ kind, time, botSaid, feedback, problem, fix }) => ({
        kind,
        time,
        botSaid,
        feedback,
        problem,
        fix,
      })),
    );
    result.feedback = items.length;
    log.info('bot feedback', {
      items: items.map(({ kind, time, problem }) => ({ kind, time, problem })),
    });
    const learn = items.filter((item) => item.kind === 'knowledge' && item.term);
    if (toLearn && learn.length) {
      const added = toLearn.list.add(
        learn.map(({ term, question, problem }) => ({
          term,
          question: question || problem,
          from: `直播 ${day} 观众说机器人说错了`,
        })),
        // A term the knowledge base has is what's wrong here, so it's added all the same.
        { known: () => false, max: MAX_FEEDBACK },
      );
      if (added.length) log.info('to learn', { items: added.map(({ term }) => term) });
    }
  }

  /** The day the lines are from, `2026-10-30`, or the span of days when they run over several. */
  private daysOf(lines: readonly RecordLine[]): string {
    const { dayOf = (ms) => new Date(ms).toLocaleDateString('sv-SE') } = this.options;
    const first = dayOf(Math.min(...lines.map((line) => line.ms)));
    const last = dayOf(Math.max(...lines.map((line) => line.ms)));
    return first === last ? first : `${first} 至 ${last}`;
  }

  /** Claude's answer as JSON, or null (logged) when it failed or isn't JSON. */
  private async ask(
    prompt: string,
    schema: object,
    part: string,
  ): Promise<Record<string, unknown> | null> {
    const { ask, log, timeoutMs = 600_000 } = this.options;
    try {
      const answer = parseJsonObject(
        await ask({ prompt, schema, tools: [], why: part, timeoutMs }),
      );
      if (!answer) log.warn('remember got an answer that is not JSON', { part });
      return answer;
    } catch (err) {
      log.warn('could not remember', { part, error: errorMessage(err) });
      return null;
    }
  }

  /** Makes `changes` to one file, logging each like update_memory does; how many were made. */
  private apply(target: Target, changes: readonly Change[]): number {
    const { memory, log } = this.options;
    if (!changes.length) return 0;
    const done = memory.changeAll(target, changes, { by: 'chat' });
    for (const change of done.made) {
      log.info('memory updated', { ...target, ...change, by: 'chat', used: done.used });
    }
    for (const { change, why } of done.skipped) {
      log.warn('memory change skipped', { ...target, ...change, by: 'chat', why });
    }
    return done.made.length;
  }
}
