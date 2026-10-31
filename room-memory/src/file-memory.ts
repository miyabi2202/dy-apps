import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyChanges, type Change } from './change';
import { memoryLength, parseEntries, type Entry } from './entry';
import { NOTE_LIMIT, ROOM_MEMORY_LIMIT, STREAMER_NOTE_LIMIT } from './limits';
import { refusal, type Target, type Writer } from './policy';

/** What making some changes did. */
export interface ChangeResult {
  made: Change[];
  skipped: { change: Change; why: string }[];
  /** How many characters the file holds now, and its limit. */
  used: number;
  limit: number;
}

/**
 * What the bot remembers in a room: the room's own memory and one note a person. Who may change
 * what, the limits and the file format are all in here.
 */
export interface RoomMemory {
  /** The room's memory as a prompt has it; empty when there's none. */
  roomText(): string;
  /** What's kept about one person as a prompt has it; empty when there's none. */
  noteText(userId: string): string;
  entries(target: Target): Entry[];
  limitOf(target: Target): number;
  /** One change by `writer`: how full the file is now, or why it wasn't made (in words for Claude). */
  change(
    target: Target,
    change: Change,
    writer: Writer,
  ): { ok: true; used: number; limit: number } | { ok: false; why: string };
  /** Each of `changes` in turn, as change does; one that can't be made is skipped and the rest still are. */
  changeAll(target: Target, changes: readonly Change[], writer: Writer): ChangeResult;
}

export interface FileMemoryOptions {
  read?: (path: string) => string;
  /** Writes the whole file, creating its folder. */
  write?: (path: string, text: string) => void;
  /** The folder a person's note.md is in: their user id, or a hash of it. */
  folderOf: (userId: string) => string;
  /** The streamer's user id, read each time; their note has a bigger limit. */
  streamerId: () => string | undefined;
  /** Whether the room is 私密, read each time. */
  isPrivate: () => boolean;
}

/** Writes to a temporary file and renames it into place, so a reader never sees half a file. */
function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}

/**
 * The memory of the room in `dir` (`data/<房间号>/`): the room's in `memory.md`, each person's in
 * `<folder>/note.md`. Read on every use, so a hand edit applies at once; a file that isn't there
 * yet reads as empty.
 */
export function fileMemory(dir: string, options: FileMemoryOptions): RoomMemory {
  const {
    read = (path) => readFileSync(path, 'utf8'),
    write = writeAtomic,
    folderOf,
    streamerId,
    isPrivate,
  } = options;
  const fileOf = (target: Target) =>
    target.scope === 'room'
      ? join(dir, 'memory.md')
      : join(dir, folderOf(target.userId), 'note.md');
  const textOf = (target: Target) => {
    try {
      return read(fileOf(target));
    } catch {
      return '';
    }
  };
  const limitOf = (target: Target) => {
    if (target.scope === 'room') return ROOM_MEMORY_LIMIT;
    return target.userId === streamerId() ? STREAMER_NOTE_LIMIT : NOTE_LIMIT;
  };
  const changeAll = (target: Target, changes: readonly Change[], writer: Writer): ChangeResult => {
    const limit = limitOf(target);
    const facts = { isPrivate: isPrivate(), streamerId: streamerId() };
    // Read and written in one go: no other change can come in between.
    const done = applyChanges(textOf(target), changes, limit, (change, entries) =>
      refusal(target, change, entries, writer, facts),
    );
    if (done.made.length) write(fileOf(target), done.text);
    return { made: done.made, skipped: done.skipped, used: memoryLength(done.text), limit };
  };
  return {
    roomText: () => textOf({ scope: 'room' }),
    noteText: (userId) => textOf({ scope: 'note', userId }),
    entries: (target) => parseEntries(textOf(target)),
    limitOf,
    change(target, change, writer) {
      const { skipped, used, limit } = changeAll(target, [change], writer);
      return skipped[0] ? { ok: false, why: skipped[0].why } : { ok: true, used, limit };
    },
    changeAll,
  };
}
