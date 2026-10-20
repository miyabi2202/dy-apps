import { parseJsonObject } from './json-answer';
import { clock } from './local-time';
import type { Heard } from './prompt';
import { readMark } from './reading';
import type { RoomLine } from './relevance';
import type { Wording } from './wording';

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
 * from 1, `about` ones (what the judge found about the bot) starred, the rest as context. A numbered
 * line `matches` a room command's trigger for ends `→ <id>`.
 */
export function pickLines(
  lines: readonly RoomLine[],
  pickable: (line: RoomLine) => boolean,
  about: ReadonlySet<RoomLine>,
  matches: (line: RoomLine) => readonly string[] = () => [],
): { text: string; numbered: RoomLine[] } {
  const numbered: RoomLine[] = [];
  const text = lines
    .map((line) => {
      const said = `${clock(line.ts)} [${line.who}] ${line.text}`;
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
 * `{{commands}}`, what the room's own commands answer, without an @ too (empty for none).
 */
export function pickPrompt(
  template: string,
  wording: Wording,
  values: {
    lines: string;
    botName: string;
    persona: string;
    botTalk: string;
    commands?: readonly { id: string; when: string }[];
    /** The room's other names for the bot. */
    aliases?: readonly string[];
  },
): string {
  const { commands = [], aliases = [], ...rest } = values;
  const all: Record<string, string> = {
    ...rest,
    commands: commands.length
      ? [
          wording('pick-commands-head'),
          '',
          ...commands.map(({ id, when }) => `- ${id}：${when}`),
          '',
          wording('pick-commands-tail'),
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
  /** The room's own command to answer it with (AdditionalCommand's id); the usual prompt without. */
  command?: string;
}

/** What `chooseTargets` needs to know about the room. */
export interface TargetRules {
  /** A pick is acted on only if it's at least this sure. */
  threshold: number;
  /** At most this many are answered. */
  max: number;
  /** The streamer, so what they said on the stream is answered as theirs; null while unknown. */
  streamer: { uid: string; nickname: string } | null;
  /** The ids of the room's own commands. */
  commandIds: ReadonlySet<string>;
  /** Whether `line` may be answered as usual: the judge found it about the bot, or it follows up. */
  chatty: (line: RoomLine) => boolean;
  /** The id of the room command `line` came for (its trigger, its mentions), if any. */
  cameFor: (line: RoomLine) => string | undefined;
  /** Told why a pick was dropped or sent to a command, for the log. */
  note: (message: string, meta: object) => void;
}

/**
 * Whom to answer, of the `picks` the picker made of the `numbered` lines: only what it's sure
 * enough of, surest first, one answer for each person (the first, so the surest), at most
 * `max`, as the chatter's or (said on the stream) the streamer's. A command the room doesn't have
 * is answered as usual. A line that came only for a room command (its trigger or mentions) and
 * was picked to be answered as usual goes to that command instead, which knows its data and sends
 * nothing when it isn't for it; one that isn't about the bot and has no command is dropped.
 */
export function chooseTargets(
  picks: readonly Pick[],
  numbered: readonly RoomLine[],
  { threshold, max, streamer, commandIds, chatty, cameFor, note }: TargetRules,
): (UnpromptedReply & { confidence: number })[] {
  const targets = new Map<string, UnpromptedReply & { confidence: number }>();
  const sure = picks
    .filter(({ confidence }) => confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
  for (const { line: n, confidence, command } of sure) {
    const line = numbered[n - 1];
    if (!line) continue;
    let withCommand: { command?: string } = commandIds.has(command) ? { command } : {};
    if (!withCommand.command && !chatty(line)) {
      const matched = cameFor(line);
      if (!matched) {
        note('pick dropped: not about the bot, and no command', { text: line.text });
        continue;
      }
      note('pick handed to the command it came for', { text: line.text, command: matched });
      withCommand = { command: matched };
    }
    const target: UnpromptedReply | null = line.userId
      ? {
          nickname: line.who,
          userId: line.userId,
          question: line.text,
          heard: 'chat',
          ...withCommand,
        }
      : streamer && {
          nickname: streamer.nickname,
          userId: streamer.uid,
          question: line.text,
          heard: 'speech',
          ...withCommand,
        };
    if (target && !targets.has(target.userId))
      targets.set(target.userId, { ...target, confidence });
  }
  return [...targets.values()].slice(0, max);
}
