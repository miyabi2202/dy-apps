import { parseJsonObject } from './json-answer';
import { clock } from './local-time';
import { readMark } from './reading';
import type { RoomLine } from './relevance';

/** One numbered line and how sure the picker is that the bot should answer it now. */
export interface Pick {
  line: number;
  /** 0–1: how sure the bot should answer it now. */
  confidence: number;
  /** The room's own command to answer it with (its id, can-sing); empty for the usual answer. */
  command: string;
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
          command: {
            type: 'string',
            description: '用哪个指令回答（指令名，比如 can-sing）；照常回答就是空字符串',
          },
        },
        required: ['line', 'confidence', 'command'],
        additionalProperties: false,
      },
      description: '每一条带编号的都打一个分',
    },
  },
  required: ['picks'],
  additionalProperties: false,
} as const;

/** `text` as the picker's picks, or null when it isn't one (the model ignored the schema). */
export function parseReplyPick(text: string): Pick[] | null {
  const picks = parseJsonObject(text)?.picks;
  if (!Array.isArray(picks)) return null;
  const valid = (p: unknown): p is Omit<Pick, 'command'> & { command?: unknown } =>
    typeof p === 'object' &&
    p !== null &&
    Number.isInteger((p as Pick).line) &&
    typeof (p as Pick).confidence === 'number';
  if (!picks.every(valid)) return null;
  return picks.map(({ line, confidence, command }) => ({
    line,
    confidence,
    command: typeof command === 'string' ? command.trim() : '',
  }));
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

/**
 * The picker's prompt's `{{key}}`s: the lines, the bot's name and persona, what it said lately, and
 * `{{commands}}`, what the room's own commands answer, without an @ too (empty for none).
 */
export function pickPrompt(
  template: string,
  values: {
    lines: string;
    botName: string;
    persona: string;
    botTalk: string;
    commands?: readonly { id: string; when: string }[];
  },
): string {
  const { commands = [], ...rest } = values;
  const all: Record<string, string> = {
    ...rest,
    commands: commands.length
      ? [
          '除了跟它说话的，下面这些问题它也会回答，哪怕不是在跟它说话、也没提到它（每种用一个指令回答）：',
          '',
          ...commands.map(({ id, when }) => `- ${id}：${when}`),
          '',
          '这种也打分，`command` 写那个指令名：问得清楚，后面主播和别的观众都还没回答（主播没说会不会，也没开始唱），给 0.8～1；主播自己叫机器人、问它这类问题（比如问它自己会唱哪些歌），也算，给最高；拿不准是不是在问，给 0.3～0.5；已经有人回答了、主播已经在回应或开唱了、主播是在回答观众或自言自语，或者同一个问题机器人刚回答过，给 0～0.2。凡是这类问题，哪怕是在跟机器人说话，`command` 也要写那个指令名，不要留空。别的 `command` 都写空字符串。',
        ].join('\n')
      : '',
    persona: values.persona ? `它的人设：${values.persona}。` : '',
    botTalk: values.botTalk.trim() || '（暂无）',
    readMark: readMark('某人'),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => all[key] ?? match);
}
