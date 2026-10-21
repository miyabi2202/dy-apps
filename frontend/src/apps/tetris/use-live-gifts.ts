import {
  RoomFeedClient,
  messageFromEvent,
  type RoomFeedSocket,
  type RoomFeedState,
  type LiveRoom,
} from '@dy-apps/services';
import { useEffect, useState } from 'react';
import type { GiftFeed } from './gift-feed';
import { log } from './log';

/** room-feed may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateRoomFeedClient = (room: LiveRoom) => RoomFeedClient;

export const createRoomFeedClient = (
  room: LiveRoom,
  openSocket?: (url: string) => RoomFeedSocket,
): RoomFeedClient => new RoomFeedClient({ ...room, retryMs: RETRY_MS, openSocket });

/**
 * Stays connected to `room` while it's set and sends every gift its viewers send into the
 * game through `feed`, one curse draw per gift. Retries a few seconds after a failure or drop.
 */
export function useLiveGifts(
  room: LiveRoom | null,
  feed: GiftFeed,
  create: CreateRoomFeedClient = createRoomFeedClient,
): RoomFeedState {
  const [state, setState] = useState<RoomFeedState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    log.debug(`room-feed: connecting to room ${roomId} on port ${port}`);
    const client = create({ port, roomId });
    client.onStatus((status, detail) => {
      const text = `room-feed: ${status}${detail ? ` (${detail})` : ''}`;
      if (status === 'error') log.warn(text);
      else log.debug(text);
      setState({ status, detail });
    });
    client.onGift((ev, newGifts) => {
      const message = messageFromEvent(ev, newGifts);
      if (message) feed.send(message);
    });
    client.connect();
    return () => {
      log.debug(`room-feed: closing the connection to room ${roomId}`);
      client.close();
      setState({ status: 'idle' });
    };
  }, [port, roomId, feed, create]);

  return room ? state : { status: 'idle' };
}
