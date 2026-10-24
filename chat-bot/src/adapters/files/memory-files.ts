import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Memory } from '../../app/ports';
import { writeTextAtomic } from './atomic-file';
import { folderOf } from './room-talk-files';

/**
 * What the bot remembers in the room in `dir` (`data/<房间号>/`): the room's in `memory.md`, and
 * each person's in `<user id>/note.md`, next to their talk.txt. Read on every use, so a hand edit
 * applies at once; a file that isn't there yet reads as empty.
 */
export function memoryFiles(
  dir: string,
  {
    read = (path) => readFileSync(path, 'utf8'),
    write = writeTextAtomic,
  }: { read?: (path: string) => string; write?: (path: string, text: string) => void } = {},
): Memory {
  const roomFile = join(dir, 'memory.md');
  const noteFile = (userId: string) => join(dir, folderOf(userId), 'note.md');
  const readOrEmpty = (path: string) => {
    try {
      return read(path);
    } catch {
      return '';
    }
  };
  return {
    room: () => readOrEmpty(roomFile),
    setRoom: (text) => write(roomFile, text),
    note: (userId) => readOrEmpty(noteFile(userId)),
    setNote: (userId, text) => write(noteFile(userId), text),
  };
}

/**
 * The room's chat record in `chatDir` (files named by their first line's ms, see ChatLog) from
 * `sinceMs` on, as text: the files that may hold lines from then, oldest first. Lines before
 * `sinceMs` in the first of them are left for the reader to drop.
 */
export function readRecordSince(
  chatDir: string,
  sinceMs: number,
  {
    list = (dir) => readdirSync(dir),
    read = (path) => readFileSync(path, 'utf8'),
  }: { list?: (dir: string) => string[]; read?: (path: string) => string } = {},
): string[] {
  let names: string[];
  try {
    names = list(chatDir).filter((name) => /^\d+\.txt$/.test(name));
  } catch {
    return [];
  }
  const files = names
    .map((name) => ({ name, first: Number(name.slice(0, -4)) }))
    .sort((a, b) => a.first - b.first);
  // A file's lines run until the next one's first: keep it when that's after sinceMs.
  const kept = files.filter((_, i) => (files[i + 1]?.first ?? Infinity) > sinceMs);
  return kept.map(({ name }) => read(join(chatDir, name)));
}

/**
 * Up to when the chat record was last read into memory (`remember`), in `<dir>/memory_read.txt` as
 * ms since the epoch; undefined before the first time.
 */
export function memoryReadMark(
  dir: string,
  {
    read = (path) => readFileSync(path, 'utf8'),
    write = writeTextAtomic,
  }: { read?: (path: string) => string; write?: (path: string, text: string) => void } = {},
): { get(): number | undefined; set(ms: number): void } {
  const path = join(dir, 'memory_read.txt');
  return {
    get() {
      try {
        const ms = Number(read(path).trim());
        return Number.isFinite(ms) && ms > 0 ? ms : undefined;
      } catch {
        return undefined;
      }
    },
    set: (ms) => write(path, `${ms}\n`),
  };
}
