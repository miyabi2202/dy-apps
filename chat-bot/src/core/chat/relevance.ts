import { clock } from '../prompts/local-time';
import { readMark, unread } from './reading';
import type { ChatLine } from './room-events';
import { isGuest, isSung, type TranscriptLine } from '../songs/transcript';
import type { Wording } from '../prompts/wording';

/** One thing said in the room: a chat, or a sentence the streamer (or a guest) said or sang. */
export interface RoomLine {
  ts: number;
  /** The chatter's nickname, 主播 or 连线. */
  who: string;
  /** The chatter's user id, for a chat. */
  userId?: string;
  text: string;
  /** Whether it may be about the bot: not the bot's own, not an @ of it (answered anyway), not sung. */
  candidate: boolean;
}

/** How far back a chat may be for the streamer to be reading it out. */
const READ_WITHIN_MS = 120_000;

/**
 * The room's chat and transcript as one list, oldest first, with what the streamer read out of the
 * chat (or the bot's replies) marked as such (see unread): the streamer reading chat aloud isn't
 * them saying it, and a line that was nothing but reading is left out.
 */
export function roomLines(
  chat: readonly ChatLine[],
  transcript: readonly TranscriptLine[],
  botName: string,
): RoomLine[] {
  const chats: RoomLine[] = chat.map((line) => ({
    ts: line.ts,
    who: line.nickname,
    ...(line.userId && { userId: line.userId }),
    text: line.content,
    candidate: line.nickname !== botName && !line.content.includes(`@${botName}`),
  }));
  const spoken = transcript.flatMap((line): RoomLine[] => {
    const sung = isSung(line);
    const read = chat.filter((c) => c.ts <= line.end && line.end - c.ts <= READ_WITHIN_MS);
    const text = sung ? line.text : unread(line.text, read);
    if (text === null) return [];
    return [
      {
        ts: line.end,
        who: isGuest(line) ? '连线' : '主播',
        text: sung ? `（唱）${text}` : text,
        candidate: !sung,
      },
    ];
  });
  return [...chats, ...spoken].sort((a, b) => a.ts - b.ts);
}

/** What Jev is asked about some new lines: the room before them, and one question per line. */
export interface RelevanceRequest {
  state: string;
  questions: Record<string, string>;
}

/**
 * Asks, of each of `fresh`, whether it's about the bot: said to it, about it (even as 它), or
 * picking up what it said. The bot isn't called an AI, so talk of AI songs or other AIs isn't
 * taken for it; `persona` gives the names viewers may call it by. And, as `q<n>t<m>`, whether it's
 * what the room's m-th own command is for (`topics`, each its `when`: 在问主播会不会唱某首歌…),
 * which the bot answers too.
 */
export function relevanceRequest(
  before: readonly RoomLine[],
  fresh: readonly RoomLine[],
  botName: string,
  persona: string,
  wording: Wording,
  topics: readonly string[] = [],
  aliases: readonly string[] = [],
  timeZone?: string,
): RelevanceRequest {
  const line = (l: RoomLine) => `${clock(l.ts, timeZone)} [${l.who}] ${l.text}`;
  const state = [
    wording('relevance-state', {
      botName,
      persona: persona ? `它的人设：${persona}。` : '',
      aliases: aliases.length ? wording('aliases-it', { names: aliases.join('、') }) : '',
      readMark: readMark('某人'),
    }),
    '',
    '之前的直播间（从旧到新）：',
    ...before.map(line),
    '',
    '新内容：',
    ...fresh.map((l, i) => `(${i + 1}) ${line(l)}`),
  ].join('\n');
  const questions = Object.fromEntries(
    fresh.flatMap((_, i): [string, string][] => [
      [`q${i + 1}`, wording('relevance-bot', { n: i + 1 })],
      ...topics.map((when, j): [string, string] => [
        `q${i + 1}t${j + 1}`,
        wording('relevance-topic', { n: i + 1, when }),
      ]),
    ]),
  );
  return { state, questions };
}

/** The key of `line` that stays the same when the room's lines are made again from the chat. */
export const lineKey = (line: RoomLine): string => `${line.ts} ${line.who} ${line.text}`;

/** What the judge's scores made of the new lines. */
export interface Relevance {
  /** The lines at least `threshold` likely about the bot or for a room command, or matching a trigger. */
  about: RoomLine[];
  /** Of them, those about the bot itself. */
  toBot: RoomLine[];
  /** The likeliest of all of `fresh`, to log. */
  best: { line: RoomLine; score: number };
}

/**
 * The judge's `scores` (by question key, see relevanceRequest) for the `fresh` lines, given
 * `topics` room commands. A line's score is the likeliest of what it may be: about the bot, or
 * for one of the commands; one `triggered` (matching a command's trigger) is taken as for it.
 * `fresh` isn't empty.
 */
export function scoreRelevance(
  fresh: readonly RoomLine[],
  scores: Readonly<Record<string, number>>,
  {
    threshold,
    topics,
    triggered,
  }: { threshold: number; topics: number; triggered: (line: RoomLine) => boolean },
): Relevance {
  const scored = fresh.map((line, i) => {
    const asked = [`q${i + 1}`, ...Array.from({ length: topics }, (_, j) => `q${i + 1}t${j + 1}`)];
    const score = Math.max(...asked.map((key) => scores[key] ?? 0));
    return {
      line,
      score,
      toBot: (scores[`q${i + 1}`] ?? 0) >= threshold,
      triggered: triggered(line),
    };
  });
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    about: scored
      .filter(({ score, triggered }) => score >= threshold || triggered)
      .map(({ line }) => line),
    toBot: scored.filter((s) => s.toBot).map(({ line }) => line),
    best: { line: best.line, score: best.score },
  };
}
