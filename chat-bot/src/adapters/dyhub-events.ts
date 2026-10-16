import type { DyhubClient, DyhubCommentEvent, DyhubGiftEvent } from '@dy-apps/services';
import type { RoomEvents } from '../app/ports';
import type { Gift, IncomingChat } from '../core/room-events';

export function chatFrom(event: DyhubCommentEvent): IncomingChat {
  return {
    ts: event.ts,
    userId: event.user?.id,
    nickname: event.user?.nickname ?? '匿名',
    content: event.data.content,
    mentions: (event.data.parts ?? []).flatMap((part) =>
      part.type === 'mention' ? [{ text: part.text, userId: part.userId }] : [],
    ),
  };
}

/** `newGifts` of the event's gift, or null when there's nobody to credit or nothing new. */
export function giftFrom(event: DyhubGiftEvent, newGifts: number): Gift | null {
  if (!event.user || newGifts <= 0) return null;
  return {
    userId: event.user.id,
    nickname: event.user.nickname,
    name: event.data.giftName ?? '礼物',
    count: newGifts,
    diamonds: newGifts * (event.data.diamondCount ?? 0),
  };
}

/** A DyHub room stream as the bot's RoomEvents. */
export function dyhubEvents(
  client: Pick<DyhubClient, 'onComment' | 'onGift' | 'onStatus' | 'connect' | 'close'>,
): RoomEvents {
  return {
    onChat: (handler) => void client.onComment((event) => handler(chatFrom(event))),
    onGift: (handler) =>
      void client.onGift((event, newGifts) => {
        const gift = giftFrom(event, newGifts);
        if (gift) handler(gift);
      }),
    onStatus: (handler) => void client.onStatus(handler),
    connect: () => client.connect(),
    close: () => client.close(),
  };
}
