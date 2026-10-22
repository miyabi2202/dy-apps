import type { ChatEvent, GiftEvent } from '@dy-apps/room-feed-protocol';
import type { RoomFeedClient } from '@dy-apps/room-feed-protocol';
import type { RoomEvents } from '../../app/ports';
import type { Gift, IncomingChat } from '../../core/chat/room-events';
import { viewerIdOf } from '../../core/viewers/viewer-id';

export function chatFrom(event: ChatEvent, hidden = false): IncomingChat {
  return {
    ts: event.ts,
    userId: event.user && viewerIdOf(event.user, hidden),
    nickname: event.user?.nickname ?? '匿名',
    content: event.data.content,
    ...(event.user?.badges?.length && { badges: event.user.badges }),
    ...(event.user?.fansClub && {
      fansClub: {
        level: event.user.fansClub.level,
        ...(event.user.fansClub.anchorId && { anchorId: event.user.fansClub.anchorId }),
      },
    }),
    ...(event.user?.payLevel !== undefined && { payLevel: event.user.payLevel }),
    mentions: (event.data.parts ?? []).flatMap((part) =>
      part.type === 'mention' ? [{ text: part.text, userId: part.userId }] : [],
    ),
  };
}

/** `newGifts` of the event's gift, or null when there's nobody to credit or nothing new. */
export function giftFrom(event: GiftEvent, newGifts: number, hidden = false): Gift | null {
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
 * A room-feed room stream as the bot's RoomEvents; `hidden` tells, as each event comes, whether it's
 * a 私密 room (see userIdOf).
 */
export function roomFeedEvents(
  client: Pick<RoomFeedClient, 'onComment' | 'onGift' | 'onStatus' | 'connect' | 'close'>,
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
