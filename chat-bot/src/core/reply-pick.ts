import { clock } from './local-time';
import { readMark } from './reading';
import type { RoomLine } from './relevance';

/** One numbered line the picker thinks the bot may answer, and how sure it is that it should. */
export interface Pick {
  line: number;
  /** 0–1: how sure the bot should answer it now. */
  confidence: number;
}

/** The JSON Schema the picker answers in (strict: every field required, no others). */
export const REPLY_PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'integer', description: '那一条的编号' },
          confidence: {
            type: 'number',
            description: '0 到 1，有多确定机器人现在应该回复这一条',
          },
        },
        required: ['line', 'confidence'],
        additionalProperties: false,
      },
      description: '可能需要机器人回复的那几条，各带一个把握；都不用回就是空数组',
    },
  },
  required: ['picks'],
  additionalProperties: false,
} as const;

/** `text` as the picker's picks, or null when it isn't one (the model ignored the schema). */
export function parseReplyPick(text: string): Pick[] | null {
  let answer: { picks?: unknown };
  try {
    answer = JSON.parse(text) as typeof answer;
  } catch {
    return null;
  }
  const picks = answer?.picks;
  if (!Array.isArray(picks)) return null;
  const valid = (p: unknown): p is Pick =>
    typeof p === 'object' &&
    p !== null &&
    Number.isInteger((p as Pick).line) &&
    typeof (p as Pick).confidence === 'number';
  return picks.every(valid) ? picks : null;
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
