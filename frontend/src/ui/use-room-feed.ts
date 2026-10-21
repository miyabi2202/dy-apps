import {
  RoomFeedClient,
  type RoomFeedSocket,
  type RoomFeedStatus,
} from '@dy-apps/room-feed-protocol';
import { Logger, type LiveRoom } from '@dy-apps/services';
import { useEffect, useState } from 'react';

/** A connection's last status, for showing it; `idle` before connecting. */
export interface RoomFeedState {
  status: RoomFeedStatus | 'idle';
  detail?: string;
}

/** room-feed may start after the page (OBS often opens first), so keep trying. */
export const ROOM_FEED_RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateRoomFeedClient = (room: LiveRoom) => RoomFeedClient;

export const createRoomFeedClient = (
  room: LiveRoom,
  openSocket?: (url: string) => RoomFeedSocket,
): RoomFeedClient => new RoomFeedClient({ ...room, retryMs: ROOM_FEED_RETRY_MS, openSocket });

const defaultLog = new Logger('room-feed');

/**
 * Stays connected to `room` while it's set and reports the connection's state. When the
 * connection fails or drops, it tries again after a few seconds. `subscribe` registers the
 * app's handlers on each new client (which decide what the client asks room-feed for) and may
 * return a cleanup that runs when the connection is closed. It's an effect dependency, so
 * memoise it (`useCallback`) or the page reconnects on every render.
 */
export function useRoomFeed(
  room: LiveRoom | null,
  subscribe: (client: RoomFeedClient) => void | (() => void),
  {
    create = createRoomFeedClient,
    log = defaultLog,
  }: { create?: CreateRoomFeedClient; log?: Logger } = {},
): RoomFeedState {
  const [state, setState] = useState<RoomFeedState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    log.debug(`room-feed: connecting to ws://localhost:${port}/ws?roomId=${roomId}`);
    const client = create({ port, roomId });
    client.onStatus((status, detail) => {
      setState({ status, detail });
      const info = detail ? `${status} (${detail})` : status;
      if (status === 'error') log.warn(`room-feed: ${info}, retrying in ${ROOM_FEED_RETRY_MS}ms`);
      else if (status === 'closed') {
        log.debug(`room-feed: ${info}, retrying in ${ROOM_FEED_RETRY_MS}ms`);
      } else log.debug(`room-feed: ${info}`);
    });
    const cleanup = subscribe(client);
    client.connect();
    return () => {
      log.debug('room-feed: closing the connection');
      cleanup?.();
      client.close();
      setState({ status: 'idle' });
    };
  }, [port, roomId, subscribe, create, log]);

  return room ? state : { status: 'idle' };
}
