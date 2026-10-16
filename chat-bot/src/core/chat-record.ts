import { localDateTime } from './local-time';
import type { ChatLine, Gift } from './room-events';
import type { TranscriptLine } from './transcript';

/** One thing that happened in the room: the streamer spoke, a viewer chatted, or sent a gift. */
export type ChatRecord = {
  /** `主播` for the streamer, otherwise the viewer's nickname. */
  sender: string;
  userId?: string;
} & (
  | { type: 'speech'; text: string; emotion: string | null }
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
  return { type: 'speech', sender: '主播', text: line.text, emotion: line.emotion };
}

/**
 * One record as one line, short to keep Claude's reading cheap:
 *
 *     2026-10-16 16:47:33 [主播](speech)(NEUTRAL) 而且有出土的文物可以作证……
 *     2026-10-16 16:47:22 [雅#7664182420958889017](gift) 送出 人气票×1（1钻）
 */
export function formatRecord(record: ChatRecord, ms: number): string {
  const who = record.userId ? `${record.sender}#${record.userId}` : record.sender;
  const emotion = record.type === 'speech' && record.emotion ? `(${record.emotion})` : '';
  const message =
    record.type === 'gift'
      ? `送出 ${record.gift.name}×${record.gift.count}（${record.gift.diamonds}钻）`
      : record.text;
  return `${localDateTime(ms)} [${who}](${record.type})${emotion} ${message}`.replace(
    /[\r\n]+/g,
    ' ',
  );
}
