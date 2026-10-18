import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BotTalk, UserTalk } from '../app/ports';
import { exchangeLines, lastLines, talkLine } from '../core/talk-record';

export interface TalkFileOptions {
  /** How many of the latest lines `recent` gives, to keep prompts from growing without end. */
  keep?: number;
  now?: () => number;
  append?: (path: string, text: string) => void;
  read?: (path: string) => string;
}

const defaults = {
  now: Date.now,
  append: (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, text);
  },
  read: (path: string) => readFileSync(path, 'utf8'),
};

/** The last `keep` lines of `path`, or nothing when it can't be read yet. */
function tail(read: (path: string) => string, path: string, keep: number): string {
  try {
    return lastLines(read(path), keep);
  } catch {
    return '';
  }
}

/** Everything the bot sent in the room, one message a line, in `bot_logs.md`. */
export function botTalkFile(path: string, options: TalkFileOptions = {}): BotTalk {
  const { keep = 40, now, append, read } = { ...defaults, ...options };
  return {
    add: (text) => append(path, talkLine(now(), text)),
    recent: () => tail(read, path, keep),
  };
}

/**
 * The folder name for a user id: the id when it's digits, else (a 私密 viewer's `111111-苦***-31`)
 * a hash of it.
 */
function folderOf(userId: string): string {
  if (/^\d+$/.test(userId)) return userId;
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}

/** Each viewer's exchanges with the bot in `<dir>/<user id>/talk.txt` (see exchangeLines). */
export function userTalkFiles(dir: string, options: TalkFileOptions = {}): UserTalk {
  const { keep = 20, now, append, read } = { ...defaults, ...options };
  const file = (userId: string) => join(dir, folderOf(userId), 'talk.txt');
  return {
    add: (userId, exchange) => append(file(userId), exchangeLines(now(), exchange)),
    recent: (userId) => tail(read, file(userId), keep),
  };
}
