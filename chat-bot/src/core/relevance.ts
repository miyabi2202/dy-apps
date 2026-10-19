import { clock } from './local-time';
import { readMark, unread } from './reading';
import type { ChatLine } from './room-events';
import { isGuest, isSung, type TranscriptLine } from './transcript';

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
  topics: readonly string[] = [],
): RelevanceRequest {
  const line = (l: RoomLine) => `${clock(l.ts)} [${l.who}] ${l.text}`;
  const state = [
    `抖音直播间。直播间里有个聊天机器人，账号叫「${botName}」，平时只在被 @ 时回答（观众可能叫它机器人、小助手，或用它的人设名）。${persona ? `它的人设：${persona}。` : ''}[主播]/[连线] 是语音识别，可能有错字；（唱）是歌词。主播习惯把弹幕念出来，念的部分写成「${readMark('某人')}」。`,
    '',
    '之前的直播间（从旧到新）：',
    ...before.map(line),
    '',
    '新内容：',
    ...fresh.map((l, i) => `(${i + 1}) ${line(l)}`),
  ].join('\n');
  const questions = Object.fromEntries(
    fresh.flatMap((_, i): [string, string][] => [
      [
        `q${i + 1}`,
        `新内容第 (${i + 1}) 条和这个聊天机器人有关吗：在对它说话、评论或介绍它（哪怕只用「它/他」指它）、或在接它刚才的话？说到 AI 不一定是指它：AI 歌曲、AI 翻唱、豆包之类别的 AI 都不算，要看上下文。观众之间聊天、对主播说话、主播聊别的，都不算。`,
      ],
      ...topics.map((when, j): [string, string] => [
        `q${i + 1}t${j + 1}`,
        `新内容第 (${i + 1}) 条是不是${when}？`,
      ]),
    ]),
  );
  return { state, questions };
}
