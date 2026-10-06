import {
  DyhubClient,
  messageFromEvent,
  type DyhubSocket,
  type DyhubState,
  type LiveRoom,
} from '@dy-apps/services';
import { useEffect, useState } from 'react';
import type { GiftFeed } from './gift-feed';

/** DyHub may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateDyhubClient = (room: LiveRoom) => DyhubClient;

export const createDyhubClient = (
  room: LiveRoom,
  openSocket?: (url: string) => DyhubSocket,
): DyhubClient => new DyhubClient({ ...room, retryMs: RETRY_MS, openSocket });

/**
 * Stays connected to `room` while it's set and sends every gift its viewers send into the
 * game through `feed`, one curse draw per gift. Retries a few seconds after a failure or drop.
 */
export function useLiveGifts(
  room: LiveRoom | null,
  feed: GiftFeed,
  create: CreateDyhubClient = createDyhubClient,
): DyhubState {
  const [state, setState] = useState<DyhubState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    const client = create({ port, roomId });
    client.onStatus((status, detail) => setState({ status, detail }));
    client.onGift((ev, newGifts) => {
      const message = messageFromEvent(ev, newGifts);
      if (message) feed.send(message);
    });
    client.connect();
    return () => {
      client.close();
      setState({ status: 'idle' });
    };
  }, [port, roomId, feed, create]);

  return room ? state : { status: 'idle' };
}
