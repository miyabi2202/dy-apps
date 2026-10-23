import { parseJsonObject } from './json-answer';
import { clock } from '../prompts/local-time';
import type { Heard } from '../prompts/prompt';
import { readMark } from '../chat/reading';
import type { RoomLine } from '../chat/relevance';
import type { Wording } from '../prompts/wording';

/** One numbered line and how sure the picker is that the bot should answer it now. */
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
  const valid = (p: unknown): p is Pick =>
    typeof p === 'object' &&
    p !== null &&
    Number.isInteger((p as Pick).line) &&
    typeof (p as Pick).confidence === 'number';
  if (!picks.every(valid)) return null;
  return picks.map(({ line, confidence }) => ({ line, confidence }));
}

/**
 * `lines` for the picker's prompt, oldest first: each that may be answered (`pickable`) numbered
 * from 1, `about` ones (what the judge found about the bot) starred, the rest as context. A numbered
 * line `matches` a tool's listen for (its trigger or phrases) ends `→ <name>`.
 */
export function pickLines(
  lines: readonly RoomLine[],
  pickable: (line: RoomLine) => boolean,
  about: ReadonlySet<RoomLine>,
  matches: (line: RoomLine) => readonly string[] = () => [],
  timeZone?: string,
): { text: string; numbered: RoomLine[] } {
  const numbered: RoomLine[] = [];
  const text = lines
    .map((line) => {
      const said = `${clock(line.ts, timeZone)} [${line.who}] ${line.text}`;
      if (!pickable(line)) return `     ${said}`;
      numbered.push(line);
      const ids = matches(line);
      const hint = ids.length ? `  → ${ids.join('、')}` : '';
      return `(${numbered.length})${about.has(line) ? '★' : ' '} ${said}${hint}`;
    })
    .join('\n');
  return { text, numbered };
}

/**
 * The picker's prompt's `{{key}}`s: the lines, the bot's name and persona, what it said lately, and
 * `{{topics}}`, what the tools listen for, so it knows what the bot may be asked about without an @
 * (empty for none).
 */
export function pickPrompt(
  template: string,
  wording: Wording,
  values: {
    lines: string;
    botName: string;
    persona: string;
    botTalk: string;
    topics?: readonly { name: string; when: string; adminOnly?: boolean }[];
    /** The room's other names for the bot. */
    aliases?: readonly string[];
  },
): string {
  const { topics = [], aliases = [], ...rest } = values;
  const all: Record<string, string> = {
    ...rest,
    topics: topics.length
      ? [
          wording('pick-topics-head'),
          '',
          ...topics.map(
            ({ name, when, adminOnly }) =>
              `- ${name}：${when}${adminOnly ? '（只有主播和管理员）' : ''}`,
          ),
          '',
          wording('pick-topics-tail'),
        ].join('\n')
      : '',
    persona: values.persona ? `它的人设：${values.persona}。` : '',
    aliases: aliases.length ? wording('aliases-it', { names: aliases.join('、') }) : '',
    botTalk: values.botTalk.trim() || '（暂无）',
    readMark: readMark('某人'),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => all[key] ?? match);
}

/** What the bot heard someone say to or about it without an @, to answer unprompted. */
export interface UnpromptedReply {
  nickname: string;
  userId: string;
  /** What they said. */
  question: string;
  /** In the chat, or (the streamer) on the stream. */
  heard: Heard;
  /** The tools whose listen the line matched (Jev's score, a trigger or a phrase): a hint for Claude. */
  topics?: readonly string[];
}

/** What `chooseTargets` needs to know about the room. */
export interface TargetRules {
  /** A pick is acted on only if it's at least this sure. */
  threshold: number;
  /** At most this many are answered. */
  max: number;
  /** The streamer, so what they said on the stream is answered as theirs; null while unknown. */
  streamer: { uid: string; nickname: string } | null;
  /**
   * Whether `line` may be answered: the judge found it about the bot, or what one of the tools listens
   * for, or it follows up on what the bot said.
   */
  allowed: (line: RoomLine) => boolean;
  /** Told why a pick was dropped, for the log. */
  note: (message: string, meta: object) => void;
}

/**
 * Who `line` is answered as: its chatter, or, for what the streamer said (no user id), the
 * `streamer` on the stream; null for a line from the stream while the streamer is unknown.
 */
export function targetOf(
  line: RoomLine,
  streamer: TargetRules['streamer'],
): UnpromptedReply | null {
  if (line.userId) {
    return { nickname: line.who, userId: line.userId, question: line.text, heard: 'chat' };
  }
  return (
    streamer && {
      nickname: streamer.nickname,
      userId: streamer.uid,
      question: line.text,
      heard: 'speech',
    }
  );
}

/**
 * Whom to answer, of the `picks` the picker made of the `numbered` lines: only what it's sure
 * enough of, surest first, one answer for each person (the first, so the surest), at most
 * `max`, as the chatter's or (said on the stream) the streamer's. A pick of a line that isn't
 * `allowed` (the picker was asked about it only as context) is dropped.
 */
export function chooseTargets(
  picks: readonly Pick[],
  numbered: readonly RoomLine[],
  { threshold, max, streamer, allowed, note }: TargetRules,
): (UnpromptedReply & { confidence: number; line: RoomLine })[] {
  const targets = new Map<string, UnpromptedReply & { confidence: number; line: RoomLine }>();
  const sure = picks
    .filter(({ confidence }) => confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
  for (const { line: n, confidence } of sure) {
    const line = numbered[n - 1];
    if (!line) continue;
    if (!allowed(line)) {
      note('pick dropped: not about the bot', { text: line.text });
      continue;
    }
    const target = targetOf(line, streamer);
    if (target && !targets.has(target.userId))
      targets.set(target.userId, { ...target, confidence, line });
  }
  return [...targets.values()].slice(0, max);
}
