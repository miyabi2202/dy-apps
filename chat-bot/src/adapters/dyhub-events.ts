import type { DyhubClient, DyhubCommentEvent, DyhubGiftEvent, DyhubUser } from '@dy-apps/services';
import type { RoomEvents } from '../app/ports';
import type { Gift, IncomingChat } from '../core/room-events';

/** The id Douyin gives every viewer in a 私密 room, where viewers hide who they are. */
const HIDDEN_ID = '111111';

/**
 * Who sent an event. In a 私密 room (`hidden`), viewers all share HIDDEN_ID and the same default avatar, and show only
 * their nickname's first character (`苦***`), so they're told apart by that and their wealth level,
 * taken not to change while the bot runs: `111111-苦***-31`.
 */
export function userIdOf({ id, nickname, payLevel }: DyhubUser, hidden: boolean): string {
  if (!hidden || id !== HIDDEN_ID) return id;
  return `${HIDDEN_ID}-${nickname}-${payLevel ?? 0}`;
}

export function chatFrom(event: DyhubCommentEvent, hidden = false): IncomingChat {
  return {
    ts: event.ts,
    userId: event.user && userIdOf(event.user, hidden),
    nickname: event.user?.nickname ?? '匿名',
    content: event.data.content,
    mentions: (event.data.parts ?? []).flatMap((part) =>
      part.type === 'mention' ? [{ text: part.text, userId: part.userId }] : [],
    ),
  };
}

/** `newGifts` of the event's gift, or null when there's nobody to credit or nothing new. */
export function giftFrom(event: DyhubGiftEvent, newGifts: number, hidden = false): Gift | null {
  if (!event.user || newGifts <= 0) return null;
  return {
    userId: userIdOf(event.user, hidden),
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
