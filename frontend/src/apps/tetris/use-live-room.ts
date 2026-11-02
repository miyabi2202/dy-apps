import type { RoomFeedClient } from '@dy-apps/room-feed-protocol';
import { messageFromEvent, type LiveRoom } from '@dy-apps/services';
import { useRoomFeed, type CreateRoomFeedClient, type RoomFeedState } from '@dy-apps/ui';
import { useCallback } from 'react';
import type { Sender } from './core/types';
import { log } from './log';
import type { RoomEvents } from './room-events';

/**
 * Stays connected to `room` while it's set and passes its gifts, chat and likes to `events`.
 * Retries a few seconds after a failure or drop.
 */
export function useLiveRoom(
  room: LiveRoom | null,
  events: RoomEvents,
  create?: CreateRoomFeedClient,
): RoomFeedState {
  const subscribe = useCallback(
    (client: RoomFeedClient) => {
      client.onGift((ev, newGifts) => {
        const message = messageFromEvent(ev, newGifts);
        if (message) events.gift(message);
      });
      client.onComment((ev) => {
        if (ev.user) events.comment(senderOf(ev.user), ev.data.content);
      });
      client.onLike((ev, count) => {
        if (ev.user) events.like(senderOf(ev.user), count);
      });
    },
    [events],
  );
  return useRoomFeed(room, subscribe, { create, log });
}

function senderOf({
  id,
  nickname,
  avatar,
}: {
  id: string;
  nickname: string;
  avatar?: string;
}): Sender {
  return { id, name: nickname, avatarUrl: avatar };
}
