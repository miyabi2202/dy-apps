import {
  RoomFeedClient,
  type RoomFeedSocket,
  LikeBatcher,
  type RoomFeedState,
  likeMessage,
  messageFromEvent,
  type DanmakuMessage,
  type Logger,
  type LiveRoom,
} from '@dy-apps/services';
import type { LikeEvent } from '@dy-apps/room-feed-protocol';
import { useEffect, useState } from 'react';
import { log as moduleLog } from './log';

/** room-feed may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateRoomFeedClient = (room: LiveRoom) => RoomFeedClient;

export const createRoomFeedClient = (
  room: LiveRoom,
  openSocket?: (url: string) => RoomFeedSocket,
): RoomFeedClient => new RoomFeedClient({ ...room, retryMs: RETRY_MS, openSocket });

/**
 * Stays connected to `room` while it's set, pushing each chat message and gift, and each
 * user's likes once they pause. When the connection fails or drops, it tries again after
 * a few seconds.
 */
export function useRoomFeed(
  room: LiveRoom | null,
  push: (m: DanmakuMessage) => void,
  create: CreateRoomFeedClient = createRoomFeedClient,
  likeQuietMs?: number,
  log: Logger = moduleLog,
): RoomFeedState {
  const [state, setState] = useState<RoomFeedState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    log.debug(`room-feed: connecting to ws://localhost:${port}/ws?roomId=${roomId}`);
    const client = create({ port, roomId });
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
    client.onStatus((status, detail) => {
      setState({ status, detail });
      const info = detail ? `${status} (${detail})` : status;
      if (status === 'error' || status === 'closed') {
        log.debug(`room-feed: ${info}, retrying in ${RETRY_MS}ms`);
      } else log.debug(`room-feed: ${info}`);
    });
    client.onComment((ev) => pushEvent(messageFromEvent(ev, 0)));
    client.onGift((ev, newGifts) => pushEvent(messageFromEvent(ev, newGifts)));
    client.onLike((ev, count) => {
      if (ev.user) likes.add(ev.user.id, ev, count);
    });
    client.connect();
    return () => {
      log.debug('room-feed: closing the connection');
      client.close();
      likes.clear();
      setState({ status: 'idle' });
    };
  }, [port, roomId, push, create, likeQuietMs, log]);

  return room ? state : { status: 'idle' };
}
