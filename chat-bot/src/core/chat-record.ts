import { recordStamp } from './local-time';
import type { ChatLine, Gift } from './room-events';
import { isGuest, isSung, type TranscriptLine } from './transcript';

/** One thing that happened in the room: the streamer spoke, a viewer chatted, or sent a gift. */
export type ChatRecord = {
  /** `主播` for the streamer, `连线` for whoever they're linked up with, else the viewer's nickname. */
  sender: string;
  userId?: string;
  /** What the sender wears, for a chat: `V` / `V年` (直播间会员), `灯牌16`, `财富36`. */
  tags?: string[];
} &
  /** What the streamer said, or sang. */
  (
    | { type: 'speech' | 'sing'; text: string }
    | { type: 'chat'; text: string }
    | { type: 'gift'; gift: { name: string; count: number; diamonds: number } }
  );

export function chatRecord(chat: ChatLine): ChatRecord {
  const tags = senderTags(chat);
  return {
    type: 'chat',
    sender: chat.nickname,
    userId: chat.userId,
    ...(tags.length && { tags }),
    text: chat.content,
  };
}

/**
 * The sender's 直播间会员 badge (`V`, `V年`), fan club level (`灯牌16`) and wealth level
 * (`财富36`), as far as room-feed sends them: none in a 私密 room but the wealth level.
 */
function senderTags({ badges = [], fansClub, payLevel }: ChatLine): string[] {
  return [
    ...badges.filter((badge) => badge === 'V' || badge === 'V年'),
    ...(fansClub?.level ? [`灯牌${fansClub.level}`] : []),
    ...(payLevel ? [`财富${payLevel}`] : []),
  ];
}

export function giftRecord({ userId, nickname, name, count, diamonds }: Gift): ChatRecord {
  return { type: 'gift', sender: nickname, userId, gift: { name, count, diamonds } };
}

export function speechRecord(line: TranscriptLine): ChatRecord {
  return {
    type: isSung(line) ? 'sing' : 'speech',
    sender: isGuest(line) ? '连线' : '主播',
    text: line.text,
  };
}

/**
 * A sung line as the speech service told whose it is, for looking at how well it tells singers
 * apart: `[主播|声2|0.83](sing)`, or `[连线|声3](sing)` for another voice (tagged with the voice's
 * number and how close the line was to it; no closeness for a voice heard first).
 */
export function singingRecord(line: TranscriptLine): ChatRecord {
  const tags = [
    ...(line.speaker !== undefined ? [`声${line.speaker}`] : []),
    ...(line.voice !== undefined ? [String(line.voice)] : []),
  ];
  return {
    type: 'sing',
    sender: line.host === false ? '连线' : '主播',
    ...(tags.length && { tags }),
    text: line.text,
  };
}

/**
 * One record as one line, short to keep Claude's reading cheap, its time in `timeZone` (the
 * room's) with the offset:
 *
 *     2026-10-16 16:47:33+08:00 [主播](speech) 而且有出土的文物可以作证……
 *     2026-10-17 20:40:21+08:00 [主播](sing) 寒江陪烟火月伴星如昨
 *     2026-10-17 21:02:10+08:00 [连线](speech) 你那边信号不太好
 *     2026-10-16 16:47:22+08:00 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）
 *     2026-10-16 16:47:30+08:00 [雅#7664182420958889017|V年|灯牌16|财富36](chat) 讲讲曲面积分
 *
 * A chat's sender comes with what they wear, after `|`: their 直播间会员 badge, fan club level and
 * wealth level (see senderTags).
 */
export function formatRecord(record: ChatRecord, ms: number, timeZone?: string): string {
  const id = record.userId ? `${record.sender}#${record.userId}` : record.sender;
  const who = record.tags?.length ? [id, ...record.tags].join('|') : id;
  const message =
    record.type === 'gift'
      ? `送出 ${record.gift.name}×${record.gift.count}（${record.gift.diamonds}钻）`
      : record.text;
  return `${recordStamp(ms, timeZone)} [${who}](${record.type}) ${message}`.replace(
    /[\r\n]+/g,
    ' ',
  );
}
