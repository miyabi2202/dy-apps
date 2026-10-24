import type { MemoryChange } from './memory-text';

/** One line of the room's chat record (see formatRecord), read back. */
export interface RecordLine {
  /** When, ms since the epoch: a line without an offset is in the machine's time zone. */
  ms: number;
  /** The line's time as written, `2026-10-23 19:05:44+08:00`. */
  stamp: string;
  /** `主播`, `连线`, or the viewer's nickname. */
  sender: string;
  userId?: string;
  /** `chat`, `gift`, `speech`, `sing`, `play` or `song`. */
  type: string;
  text: string;
}

const LINE =
  /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})? \[(.*?)\]\((chat|gift|speech|sing|play|song)\) ?(.*)$/;

/**
 * A chat record line as its parts, or null for one that isn't one. The sender is `nickname#uid`
 * with what they wear after `|` (`[阿拂#103094206072|V|灯牌16](chat)`); the uid is the last `#`'s,
 * so a nickname with a `#` in it stays whole.
 */
export function parseRecordLine(line: string): RecordLine | null {
  const match = LINE.exec(line.trim());
  if (!match) return null;
  const [, date = '', time = '', offset = '', who = '', type = '', text = ''] = match;
  const ms = Date.parse(`${date}T${time}${offset}`);
  if (Number.isNaN(ms)) return null;
  const id = /^(.*)#([^#|]+)(?:\|[^#]*)?$/.exec(who);
  const sender = id ? id[1]! : who.split('|')[0]!;
  return {
    ms,
    stamp: `${date} ${time}${offset}`,
    sender,
    ...(id && { userId: id[2]! }),
    type,
    text,
  };
}

/** A viewer who chatted, with their own chat lines, oldest first. */
export interface Chatter {
  userId: string;
  /** Their latest nickname. */
  nickname: string;
  lines: RecordLine[];
}

/**
 * The viewers in `lines` who sent at least `minChats` chats, most first: everyone but those in
 * `exclude` (the bot, the streamer), and the streamer's and link-up's lines, which have no id.
 */
export function chattersOf(
  lines: readonly RecordLine[],
  { minChats, exclude }: { minChats: number; exclude: ReadonlySet<string> },
): Chatter[] {
  const byId = new Map<string, Chatter>();
  for (const line of lines) {
    if (line.type !== 'chat' || !line.userId || exclude.has(line.userId)) continue;
    const chatter = byId.get(line.userId) ?? { userId: line.userId, nickname: '', lines: [] };
    chatter.nickname = line.sender;
    chatter.lines.push(line);
    byId.set(line.userId, chatter);
  }
  return [...byId.values()]
    .filter((chatter) => chatter.lines.length >= minChats)
    .sort((a, b) => b.lines.length - a.lines.length);
}

/**
 * `lines` as text for a prompt, one `HH:MM:SS 发送人(类型) 内容` a line, each cut to `lineChars`,
 * and only the latest that fit in `maxChars`. Sung lines and recordings played are left out: they
 * are lyrics, not talk.
 */
export function digestText(
  lines: readonly RecordLine[],
  { lineChars = 120, maxChars }: { lineChars?: number; maxChars: number },
): string {
  const kept: string[] = [];
  let used = 0;
  for (const line of [...lines].reverse()) {
    if (line.type === 'sing' || line.type === 'play') continue;
    const text = [...line.text].slice(0, lineChars).join('');
    const out = `${line.stamp.slice(11, 19)} ${line.sender}(${line.type}) ${text}`;
    used += [...out].length + 1;
    if (used > maxChars) break;
    kept.push(out);
  }
  return kept.reverse().join('\n');
}

/** The JSON Schema of one change to a memory file (strict: every field there, empty when unused). */
const CHANGE = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['add', 'replace', 'remove'] },
    content: { type: 'string', description: 'add、replace 的新内容；remove 填空字符串' },
    old: { type: 'string', description: 'replace、remove 时那一条里的一段原文；add 填空字符串' },
  },
  required: ['action', 'content', 'old'],
  additionalProperties: false,
} as const;

const CHANGES = { type: 'array', items: CHANGE } as const;

/** What the model answers about a batch of viewers: changes to each one's note, by user id. */
export const NOTE_CHANGES_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { userId: { type: 'string' }, changes: CHANGES },
        required: ['userId', 'changes'],
        additionalProperties: false,
      },
    },
  },
  required: ['notes'],
  additionalProperties: false,
} as const;

/** What the model answers about the whole stream: changes to the room's memory and the streamer's note. */
export const ROOM_CHANGES_SCHEMA = {
  type: 'object',
  properties: { room: CHANGES, streamer: CHANGES },
  required: ['room', 'streamer'],
  additionalProperties: false,
} as const;

/** `value` (one of the schemas' change lists) as the changes in it that are whole; others are left out. */
export function memoryChangesOf(value: unknown): MemoryChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): MemoryChange[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { action, content = '', old = '' } = item as Record<string, unknown>;
    if (typeof content !== 'string' || typeof old !== 'string') return [];
    if (action === 'add') return [{ action, content }];
    if (action === 'replace') return [{ action, old, content }];
    if (action === 'remove') return [{ action, old }];
    return [];
  });
}
