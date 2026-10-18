import { clock } from './local-time';
import { readMark } from './reading';
import type { RoomLine } from './relevance';

/** Which of the numbered lines the bot should answer, as the picker answers. */
export interface ReplyPick {
  /** The lines' numbers; empty when none needs an answer any more. */
  lines: number[];
}

/** The JSON Schema ReplyPick follows (strict: every field required, no others). */
export const REPLY_PICK_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: { type: 'integer' },
      description: '机器人现在应该回复的那几条的编号，都不用回就是空数组',
    },
  },
  required: ['lines'],
  additionalProperties: false,
} as const;

/** `text` as a ReplyPick, or null when it isn't one (the model ignored the schema). */
export function parseReplyPick(text: string): ReplyPick | null {
  let answer: { lines?: unknown };
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  const lines = answer?.lines;
  if (!Array.isArray(lines) || !lines.every((n) => Number.isInteger(n))) return null;
  return { lines: lines as number[] };
}

/**
 * `lines` for the picker's prompt, oldest first: each that may be answered (`pickable`) numbered
 * from 1, `about` ones (what the judge found about the bot) starred, the rest as context.
 */
export function pickLines(
  lines: readonly RoomLine[],
  pickable: (line: RoomLine) => boolean,
  about: ReadonlySet<RoomLine>,
): { text: string; numbered: RoomLine[] } {
  const numbered: RoomLine[] = [];
  const text = lines
    .map((line) => {
      const said = `${clock(line.ts)} [${line.who}] ${line.text}`;
      if (!pickable(line)) return `     ${said}`;
      numbered.push(line);
      return `(${numbered.length})${about.has(line) ? '★' : ' '} ${said}`;
    })
    .join('\n');
  return { text, numbered };
}

/** The picker's prompt's `{{key}}`s: the lines, the bot's name and persona, what it said lately. */
export function pickPrompt(
  template: string,
  values: { lines: string; botName: string; persona: string; botTalk: string },
): string {
  const all: Record<string, string> = {
    ...values,
    persona: values.persona ? `它的人设：${values.persona}。` : '',
    botTalk: values.botTalk.trim() || '（暂无）',
    readMark: readMark('某人'),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => all[key] ?? match);
}
