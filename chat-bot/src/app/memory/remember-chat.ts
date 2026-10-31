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
  type Chatter,
  type RecordLine,
} from '../../core/memory/chat-digest';
import {
  changeMemoryAll,
  memoryLength,
  NOTE_LIMIT,
  ROOM_MEMORY_LIMIT,
  STREAMER_NOTE_LIMIT,
  type MemoryChange,
} from '../../core/memory/memory-text';
import type { AskModel, Log, Memory } from '../ports';

export interface RememberChatOptions {
  /** Claude, asked once per batch of viewers and once about the whole stream. */
  ask: AskModel;
  memory: Memory;
  /** The chat record's files that may hold lines from `sinceMs` on, as text, oldest first. */
  readSince: (sinceMs: number) => string[];
  /** Up to when the record was read into memory last time; set once a run is through. */
  mark: { get(): number | undefined; set(ms: number): void };
  /** The prompt about viewers' notes (remember-notes.md), read each time. */
  notesPrompt: () => string;
  /** The prompt about the room's memory and the streamer's note (remember-room.md), read each time. */
  roomPrompt: () => string;
  /** The streamer's user id: their note is about the whole stream, not a viewer's. */
  streamerId: () => string | undefined;
  /** The bot's own account, whose lines aren't a viewer's. */
  bot: { name: string; id?: string };
  /** A 私密 room, whose viewers can't be told apart: no viewer notes there. */
  isPrivate: () => boolean;
  log: Log;
  now?: () => number;
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

/** How full a memory file is, like `994/1000`, for the prompts to say how much room is left. */
function usage(text: string, limit: number): string {
  return `${memoryLength(text)}/${limit}`;
}

/** What one run did. */
export interface RememberResult {
  lines: number;
  viewers: number;
  changes: number;
  failed: number;
}

/**
 * Reads the room's chat record since last time into what the bot remembers: each regular's
 * note.md from what they said themselves, and the room's memory.md and the streamer's note from
 * the whole stream. Claude says what to change, in the same add / replace / remove form as
 * update_memory, and each change goes through the same checks (the limits); one that
 * fails is skipped. The mark moves on only when every question was answered, so a failed run is
 * read again next time.
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
    const result: RememberResult = { lines: lines.length, viewers: 0, changes: 0, failed: 0 };
    if (!lines.length) {
      log.info('nothing new to remember', { since });
      return result;
    }
    log.info('remembering', { since, lines: lines.length });
    if (!this.options.isPrivate()) await this.notes(lines, result);
    await this.room(lines, result);
    if (!result.failed) mark.set(Math.max(...lines.map((line) => line.ms)));
    log.info('remembered', { ...result });
    return result;
  }

  /** The viewers who said enough, a batch at a time. */
  private async notes(lines: readonly RecordLine[], result: RememberResult): Promise<void> {
    const { bot, streamerId, minChats = 5, batchSize = 8 } = this.options;
    const exclude = new Set([bot.id, streamerId()].filter((id): id is string => !!id));
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
          `现在记着的（已用 ${usage(memory.note(userId), NOTE_LIMIT)} 字）：`,
          memory.note(userId).trim() || '（无）',
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
      result.changes += this.apply(
        { scope: 'note', userId },
        memory.note(userId),
        memoryChangesOf(changes),
        NOTE_LIMIT,
        (text) => memory.setNote(userId, text),
      );
    }
  }

  /** The room's memory and the streamer's note, from the whole stream. */
  private async room(lines: readonly RecordLine[], result: RememberResult): Promise<void> {
    const { memory, roomPrompt, streamerId } = this.options;
    const streamer = streamerId();
    const answer = await this.ask(
      fillTemplate(
        roomPrompt(),
        {
          memory: memory.room().trim() || '（无）',
          roomUsed: usage(memory.room(), ROOM_MEMORY_LIMIT),
          streamerNote: (streamer && memory.note(streamer).trim()) || '（无）',
          streamerUsed: usage(streamer ? memory.note(streamer) : '', STREAMER_NOTE_LIMIT),
          digest: digestText(lines, { maxChars: 60_000 }),
        },
        { fillWhen: 'present' },
      ),
      ROOM_CHANGES_SCHEMA,
      'room',
    );
    if (answer === null) {
      result.failed++;
      return;
    }
    result.changes += this.apply(
      { scope: 'room' },
      memory.room(),
      memoryChangesOf(answer.room),
      ROOM_MEMORY_LIMIT,
      (text) => memory.setRoom(text),
    );
    if (streamer) {
      result.changes += this.apply(
        { scope: 'note', userId: streamer },
        memory.note(streamer),
        memoryChangesOf(answer.streamer),
        STREAMER_NOTE_LIMIT,
        (text) => memory.setNote(streamer, text),
      );
    }
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
  private apply(
    where: { scope: 'room' | 'note'; userId?: string },
    text: string,
    changes: readonly MemoryChange[],
    limit: number,
    write: (text: string) => void,
  ): number {
    const { log } = this.options;
    if (!changes.length) return 0;
    const done = changeMemoryAll(text, changes, limit);
    if (done.made.length) write(done.text);
    const used = memoryLength(done.text);
    for (const change of done.made) {
      log.info('memory updated', { ...where, ...change, by: 'chat', used });
    }
    for (const { change, why } of done.skipped) {
      log.warn('memory change skipped', { ...where, ...change, by: 'chat', why });
    }
    return done.made.length;
  }
}
