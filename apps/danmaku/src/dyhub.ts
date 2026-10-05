import {
  createConnectionStore,
  type DyhubEvent,
  type DyhubGiftData,
  type DyhubUser,
} from '@dy-apps/services';
import type { DanmakuMessage, DanmakuUser } from './types';

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

/** What the editor's form last held, valid or not, so a reload keeps the typing. */
export const connectionStore = createConnectionStore('danmaku');
