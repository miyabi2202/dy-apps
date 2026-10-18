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

/** Each viewer's exchanges with the bot in `<dir>/<user id>/talk.txt` (see exchangeLines). */
export function userTalkFiles(dir: string, options: TalkFileOptions = {}): UserTalk {
  const { keep = 20, now, append, read } = { ...defaults, ...options };
  // User ids are digits, or a 私密 viewer's `111111-苦***-31`: what a path can't hold becomes _.
  const file = (userId: string) =>
    join(dir, userId.replace(/[\\/:*?"<>|.\p{Cc}]/gu, '_'), 'talk.txt');
  return {
    add: (userId, exchange) => append(file(userId), exchangeLines(now(), exchange)),
    recent: (userId) => tail(read, file(userId), keep),
  };
}
