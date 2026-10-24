import { clock } from '../prompts/local-time';
import { readMark, unread } from './reading';
import type { ChatLine } from './room-events';
import { isGuest, isPlayed, isSung, type TranscriptLine } from '../songs/transcript';
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

/** What a tool listens for in the room without an @ (see BotTool.listen): Jev's question, and what makes auto-reply look at once. */
export interface ToolListen {
  /**
   * The sentence Jev judges each new line by: 在问主播会不会唱某首歌…. Without it, only a chat
   * matching `trigger` is for the tool, and it's answered at once, without Jev or the picker.
   */
  when?: string;
  /** What's said that's surely for it: auto-reply looks at once. */
  trigger?: RegExp;
  /** Which of its phrases `text` contains (a song list's title), as they are now; null for none. */
  mentioned?: (text: string) => string | null;
}

/** A tool's listen block with the tool's name, for the judge, the look-now and the picker. */
export interface ListenTopic extends ToolListen {
  name: string;
  /** Only the streamer and the admins may have it done. */
  adminOnly?: boolean;
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
    const played = isPlayed(line);
    const read = chat.filter((c) => c.ts <= line.end && line.end - c.ts <= READ_WITHIN_MS);
    const text = sung || played ? line.text : unread(line.text, read);
    if (text === null) return [];
    return [
      {
        ts: line.end,
        who: isGuest(line) && !played ? '连线' : '主播',
        text: played ? `（放歌）${text}` : sung ? `（唱）${text}` : text,
        candidate: !sung && !played,
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
 * what the m-th tool listens for (`topics`, each its `when`: 在问主播会不会唱某首歌…), which the
 * bot answers too.
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
  /** The lines at least `threshold` likely about the bot or what a tool listens for, or matching a trigger. */
  about: RoomLine[];
  /** Of them, those about the bot itself. */
  toBot: RoomLine[];
  /** Those the judge is surer of than `sureThreshold` that they're about the bot: sure enough to answer without asking the picker. */
  sure: RoomLine[];
  /**
   * For each line, the tools whose topic it is: those scored at least `threshold` for it, in the
   * order they were asked, then those whose trigger or phrases it matched; lines with none aren't
   * in it.
   */
  topics: ReadonlyMap<RoomLine, readonly string[]>;
  /** The likeliest of all of `fresh`, to log. */
  best: { line: RoomLine; score: number };
}

/**
 * The judge's `scores` (by question key, see relevanceRequest) for the `fresh` lines, given the
 * names of the `topics` the tools listen for (in the order they were asked, `q<n>t<j>` being the
 * j-th). A line's score is the likeliest of what it may be: about the bot, or one of the topics; a
 * line `matched` (by a tool's trigger or phrases) to some topics is taken as for them. The lines
 * surer than `sureThreshold` of being about the bot are `sure`. `fresh` isn't empty.
 */
export function scoreRelevance(
  fresh: readonly RoomLine[],
  scores: Readonly<Record<string, number>>,
  {
    threshold,
    topics,
    matched,
    sureThreshold,
  }: {
    threshold: number;
    topics: readonly string[];
    /** The names of the topics whose trigger or phrases `line` matched. */
    matched: (line: RoomLine) => readonly string[];
    /** What the bot score must be above (not just at) for a line to be `sure`; none are without it. */
    sureThreshold?: number;
  },
): Relevance {
  const scored = fresh.map((line, i) => {
    const asked = topics.map((name, j) => ({ name, score: scores[`q${i + 1}t${j + 1}`] ?? 0 }));
    const botScore = scores[`q${i + 1}`] ?? 0;
    const score = Math.max(botScore, ...asked.map((topic) => topic.score));
    const hits = matched(line);
    const named = [
      ...asked.filter((topic) => topic.score >= threshold).map((topic) => topic.name),
      ...hits,
    ].filter((name, k, all) => all.indexOf(name) === k);
    return {
      line,
      score,
      named,
      toBot: botScore >= threshold,
      sure: sureThreshold !== undefined && botScore > sureThreshold,
      matched: hits.length > 0,
    };
  });
  const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
  return {
    about: scored
      .filter(({ score, matched }) => score >= threshold || matched)
      .map(({ line }) => line),
    toBot: scored.filter((s) => s.toBot).map(({ line }) => line),
    sure: scored.filter((s) => s.sure).map(({ line }) => line),
    topics: new Map(scored.filter((s) => s.named.length).map((s) => [s.line, s.named])),
    best: { line: best.line, score: best.score },
  };
}
