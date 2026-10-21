import type { DyhubClient, DyhubCommentEvent, DyhubGiftEvent } from '@dy-apps/services';
import type { RoomEvents } from '../app/ports';
import type { Gift, IncomingChat } from '../core/room-events';
import { viewerIdOf } from '../core/viewer-id';

export function chatFrom(event: DyhubCommentEvent, hidden = false): IncomingChat {
  return {
    ts: event.ts,
    userId: event.user && viewerIdOf(event.user, hidden),
    nickname: event.user?.nickname ?? '匿名',
    content: event.data.content,
    ...(event.user?.badges?.length && { badges: event.user.badges }),
    mentions: (event.data.parts ?? []).flatMap((part) =>
      part.type === 'mention' ? [{ text: part.text, userId: part.userId }] : [],
    ),
  };
}

/** `newGifts` of the event's gift, or null when there's nobody to credit or nothing new. */
export function giftFrom(event: DyhubGiftEvent, newGifts: number, hidden = false): Gift | null {
  if (!event.user || newGifts <= 0) return null;
  return {
    userId: viewerIdOf(event.user, hidden),
    nickname: event.user.nickname,
    name: event.data.giftName ?? '礼物',
    count: newGifts,
    diamonds: newGifts * (event.data.diamondCount ?? 0),
  };
}

/**
 * A DyHub room stream as the bot's RoomEvents; `hidden` tells, as each event comes, whether it's
 * a 私密 room (see userIdOf).
 */
export function dyhubEvents(
  client: Pick<DyhubClient, 'onComment' | 'onGift' | 'onStatus' | 'connect' | 'close'>,
  hidden: () => boolean = () => false,
): RoomEvents {
  return {
    onChat: (handler) => void client.onComment((event) => handler(chatFrom(event, hidden()))),
    onGift: (handler) =>
      void client.onGift((event, newGifts) => {
        const gift = giftFrom(event, newGifts, hidden());
        if (gift) handler(gift);
      }),
    onStatus: (handler) => void client.onStatus(handler),
    connect: () => client.connect(),
    close: () => client.close(),
  };
}
