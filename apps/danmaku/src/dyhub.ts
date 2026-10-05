import { createStore } from '@dy-apps/local-storage';
import {
  isRoomId,
  parsePort,
  type DyhubEvent,
  type DyhubGiftData,
  type DyhubUser,
} from '@dy-apps/dyhub-client';
import type { Connection } from '@dy-apps/ui';
import type { DanmakuMessage, DanmakuUser } from './types';

/** The events the wall shows. */
export const DANMAKU_EVENT_TYPES = ['chat', 'gift', 'like'] as const;

/** How many likes one DyHub like event carries (Douyin batches a few taps). */
export function likeCount(ev: DyhubEvent): number {
  const count = ev.data?.count;
  return typeof count === 'number' && count > 0 ? count : 1;
}

/** One card for a user's run of likes, from their last like event and the run's total. */
export function likeMessage(last: DyhubEvent, total: number): DanmakuMessage | null {
  if (!last.user) return null;
  return { id: `like-${last.id}`, user: userFrom(last.user), text: '', likes: total, ts: last.ts };
}

/**
 * A DyHub chat or gift event as a wall message; null for other events and empty chats.
 * `newGifts` is how many gifts the event adds (from GiftCounter); 0 drops it as a repeat.
 */
export function messageFromEvent(ev: DyhubEvent, newGifts: number): DanmakuMessage | null {
  if (!ev.user) return null;
  const user = userFrom(ev.user);
  if (ev.type === 'gift') {
    if (newGifts <= 0) return null;
    const gift = ev.data as unknown as DyhubGiftData;
    return {
      // One id per combo, so later messages of the combo add to the same card.
      id: gift.groupId ? `gift-${user.id}-${gift.giftId}-${gift.groupId}` : ev.id,
      user,
      text: '',
      gift: {
        name: gift.giftName || '礼物',
        count: newGifts,
        diamonds: gift.diamondCount,
        iconUrl: gift.giftIcon,
      },
      ts: ev.ts,
    };
  }
  const text = ev.data?.content;
  if (ev.type !== 'chat' || typeof text !== 'string' || !text.trim()) return null;
  return { id: ev.id, user, text, ts: ev.ts };
}

function userFrom({ id, nickname, avatar, fansClub }: DyhubUser): DanmakuUser {
  return {
    id,
    nickname,
    avatarUrl: avatar,
    fansClub: fansClub && { name: fansClub.name, level: fansClub.level },
  };
}

export interface LiveRoom {
  port: number;
  roomId: string;
}

/** The room to connect to, or null if the port or room number isn't valid. */
export function liveRoomFrom(c: Connection): LiveRoom | null {
  const port = parsePort(c.port.trim());
  const roomId = c.roomId.trim();
  return port !== null && isRoomId(roomId) ? { port, roomId } : null;
}

/** URL parameters for the OBS link, so the overlay connects to the same room. */
const PARAMS = { port: 'port', roomId: 'room' } as const;

/** The room in a query string, or null if it's missing or invalid. */
export function readLiveRoom(search: string): LiveRoom | null {
  const q = new URLSearchParams(search);
  return liveRoomFrom({ port: q.get(PARAMS.port) ?? '', roomId: q.get(PARAMS.roomId) ?? '' });
}

export function setLiveRoomParams(params: URLSearchParams, room: LiveRoom): void {
  params.set(PARAMS.port, String(room.port));
  params.set(PARAMS.roomId, room.roomId);
}

/** What the editor's form last held, valid or not, so a reload keeps the typing. */
export const connectionStore = createStore<Connection>('danmaku.connection', {
  fallback: { port: '', roomId: '' },
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return undefined;
    const { port, roomId } = raw as Record<string, unknown>;
    return typeof port === 'string' && typeof roomId === 'string' ? { port, roomId } : undefined;
  },
});
