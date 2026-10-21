import type { LikeEvent, RoomFeedClient } from '@dy-apps/room-feed-protocol';
import {
  LikeBatcher,
  likeMessage,
  messageFromEvent,
  type DanmakuMessage,
  type Logger,
  type LiveRoom,
} from '@dy-apps/services';
import { useRoomFeed, type CreateRoomFeedClient, type RoomFeedState } from '@dy-apps/ui';
import { useCallback } from 'react';
import { log as moduleLog } from './log';

/**
 * Stays connected to `room` while it's set, pushing each chat message and gift, and each
 * user's likes once they pause. When the connection fails or drops, it tries again after
 * a few seconds.
 */
export function useWallFeed(
  room: LiveRoom | null,
  push: (m: DanmakuMessage) => void,
  create?: CreateRoomFeedClient,
  likeQuietMs?: number,
  log: Logger = moduleLog,
): RoomFeedState {
  const subscribe = useCallback(
    (client: RoomFeedClient) => {
      const likes = new LikeBatcher<LikeEvent>({
        quietMs: likeQuietMs,
        onFlush: (last, total) => {
          const message = likeMessage(last, total);
          if (message) push(message);
        },
      });
      const pushEvent = (message: DanmakuMessage | null) => {
        if (message) push(message);
      };
      client.onComment((ev) => pushEvent(messageFromEvent(ev, 0)));
      client.onGift((ev, newGifts) => pushEvent(messageFromEvent(ev, newGifts)));
      client.onLike((ev, count) => {
        if (ev.user) likes.add(ev.user.id, ev, count);
      });
      return () => likes.clear();
    },
    [push, likeQuietMs],
  );
  return useRoomFeed(room, subscribe, { create, log });
}
