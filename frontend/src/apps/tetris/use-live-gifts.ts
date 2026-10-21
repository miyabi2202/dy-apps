import type { RoomFeedClient, RoomFeedState } from '@dy-apps/room-feed-protocol';
import { messageFromEvent, type LiveRoom } from '@dy-apps/services';
import { useRoomFeed, type CreateRoomFeedClient } from '@dy-apps/ui';
import { useCallback } from 'react';
import type { GiftFeed } from './gift-feed';
import { log } from './log';

/**
 * Stays connected to `room` while it's set and sends every gift its viewers send into the
 * game through `feed`, one curse draw per gift. Retries a few seconds after a failure or drop.
 */
export function useLiveGifts(
  room: LiveRoom | null,
  feed: GiftFeed,
  create?: CreateRoomFeedClient,
): RoomFeedState {
  const subscribe = useCallback(
    (client: RoomFeedClient) => {
      client.onGift((ev, newGifts) => {
        const message = messageFromEvent(ev, newGifts);
        if (message) feed.send(message);
      });
    },
    [feed],
  );
  return useRoomFeed(room, subscribe, { create, log });
}
