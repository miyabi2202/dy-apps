import { readFileSync, writeFileSync } from 'node:fs';
import type { Log, WakeWords } from '../app/ports';
import { errorMessage } from '../core/errors';

export interface WakeWordFileOptions {
  log: Log;
  read?: (path: string) => string;
  write?: (path: string, text: string) => void;
}

/** The file's wake words by room id, plus `default`; throws with what's wrong when unusable. */
function parse(path: string, text: string): Record<string, string> {
  const words = JSON.parse(text) as unknown;
  if (
    typeof words !== 'object' ||
    words === null ||
    Array.isArray(words) ||
    Object.values(words).some((word) => typeof word !== 'string')
  ) {
    throw new Error(`${path}: must map room ids (and "default") to wake words`);
  }
  return words as Record<string, string>;
}

/**
 * Room `roomId`'s wake word in a JSON file shared by every room, `{"default": "我想吃鱼了",
 * "<房间号>": "…"}`: the room's own, else `default`, else none. Each `get` reads the file (it's
 * tiny) and parses it again when its text differs from last time, so edits apply at once; a file
 * that can't be read or checked keeps the last good words. `set` writes only this room's.
 */
export function wakeWordFile(
  path: string,
  roomId: string,
  {
    log,
    read = (p) => readFileSync(p, 'utf8'),
    write = (p, text) => writeFileSync(p, text),
  }: WakeWordFileOptions,
): WakeWords {
  let words: Record<string, string> = {};
  let seen: string | null = null;
  const refresh = () => {
    try {
      const text = read(path);
      if (text === seen) return;
      seen = text;
      words = parse(path, text);
      log.info('wake word', { phrase: words[roomId] ?? words.default ?? '' });
    } catch (err) {
      log.warn('could not read the wake words, keeping the last ones', {
        error: errorMessage(err),
      });
    }
  };
  refresh();
  return {
    get() {
      refresh();
      return words[roomId] ?? words.default ?? '';
    },
    set(phrase) {
      refresh();
      write(path, `${JSON.stringify({ ...words, [roomId]: phrase }, null, 2)}\n`);
    },
  };
}
