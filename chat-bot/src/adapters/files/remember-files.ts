import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeTextAtomic } from './atomic-file';

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
