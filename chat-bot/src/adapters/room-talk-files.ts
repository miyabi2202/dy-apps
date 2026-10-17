import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BotTalk, Exchange, UserTalk } from '../app/ports';
import { localDateTime } from '../core/local-time';

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

/** One line, `日期 时间 text`, with line breaks flattened. */
function line(ms: number, text: string): string {
  return `${localDateTime(ms)} ${text.replace(/[\r\n]+/g, ' ')}\n`;
}

/** The last `keep` lines of `path`, or nothing when it can't be read yet. */
function tail(read: (path: string) => string, path: string, keep: number): string {
  try {
    return read(path).trimEnd().split('\n').slice(-keep).join('\n');
  } catch {
    return '';
  }
}

/** Everything the bot sent in the room, one message a line, in `bot_talk.txt`. */
export function botTalkFile(path: string, options: TalkFileOptions = {}): BotTalk {
  const { keep = 40, now, append, read } = { ...defaults, ...options };
  return {
    add: (text) => append(path, line(now(), text)),
    recent: () => tail(read, path, keep),
  };
}

/**
 * Each viewer's exchanges with the bot in `<dir>/<user id>.txt`, two lines each:
 * `日期 时间 昵称问：…` and `日期 时间 你答：…`.
 */
export function userTalkFiles(dir: string, options: TalkFileOptions = {}): UserTalk {
  const { keep = 20, now, append, read } = { ...defaults, ...options };
  // User ids are digits; anything else is kept out of the path.
  const file = (userId: string) => join(dir, `${userId.replace(/[^\w-]/g, '_')}.txt`);
  return {
    add(userId, { nickname, question, answer }: Exchange) {
      const ms = now();
      append(file(userId), line(ms, `${nickname}问：${question}`) + line(ms, `你答：${answer}`));
    },
    recent: (userId) => tail(read, file(userId), keep),
  };
}
