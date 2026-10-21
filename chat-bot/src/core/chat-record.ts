import { localDateTime } from './local-time';
import type { ChatLine, Gift } from './room-events';
import { isGuest, isSung, type TranscriptLine } from './transcript';

/** One thing that happened in the room: the streamer spoke, a viewer chatted, or sent a gift. */
export type ChatRecord = {
  /** `主播` for the streamer, `连线` for whoever they're linked up with, else the viewer's nickname. */
  sender: string;
  userId?: string;
} &
  /** What the streamer said, or sang. */
  (
    | { type: 'speech' | 'sing'; text: string }
    | { type: 'chat'; text: string }
    | { type: 'gift'; gift: { name: string; count: number; diamonds: number } }
  );

export function chatRecord(chat: ChatLine): ChatRecord {
  return { type: 'chat', sender: chat.nickname, userId: chat.userId, text: chat.content };
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
 * One record as one line, short to keep Claude's reading cheap:
 *
 *     2026-10-16 16:47:33 [主播](speech) 而且有出土的文物可以作证……
 *     2026-10-17 20:40:21 [主播](sing) 寒江陪烟火月伴星如昨
 *     2026-10-17 21:02:10 [连线](speech) 你那边信号不太好
 *     2026-10-16 16:47:22 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）
 */
export function formatRecord(record: ChatRecord, ms: number, timeZone?: string): string {
  const who = record.userId ? `${record.sender}#${record.userId}` : record.sender;
  const message =
    record.type === 'gift'
      ? `送出 ${record.gift.name}×${record.gift.count}（${record.gift.diamonds}钻）`
      : record.text;
  return `${localDateTime(ms, timeZone)} [${who}](${record.type}) ${message}`.replace(
    /[\r\n]+/g,
    ' ',
  );
}
