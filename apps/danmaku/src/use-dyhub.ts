import {
  DyhubClient,
  type DyhubSocket,
  LikeBatcher,
  type DyhubLikeEvent,
  type DyhubStatus,
  type LiveRoom,
} from '@dy-apps/services';
import { useEffect, useState } from 'react';
import { likeMessage, messageFromEvent } from './dyhub';
import type { DanmakuMessage } from './types';

/** DyHub may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateDyhubClient = (room: LiveRoom) => DyhubClient;

export const createDyhubClient = (
  room: LiveRoom,
  openSocket?: (url: string) => DyhubSocket,
): DyhubClient => new DyhubClient({ ...room, retryMs: RETRY_MS, openSocket });

export interface DyhubState {
  status: DyhubStatus | 'idle';
  detail?: string;
}

/**
 * Stays connected to `room` while it's set, pushing each chat message and gift, and each
 * user's likes once they pause. When the connection fails or drops, it tries again after
 * a few seconds.
 */
export function useDyhub(
  room: LiveRoom | null,
  push: (m: DanmakuMessage) => void,
  create: CreateDyhubClient = createDyhubClient,
  likeQuietMs?: number,
): DyhubState {
  const [state, setState] = useState<DyhubState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    const client = create({ port, roomId });
    const likes = new LikeBatcher<DyhubLikeEvent>({
      quietMs: likeQuietMs,
      onFlush: (last, total) => {
        const message = likeMessage(last, total);
        if (message) push(message);
      },
    });
    const pushEvent = (message: DanmakuMessage | null) => {
      if (message) push(message);
    };
    client.onStatus((status, detail) => setState({ status, detail }));
    client.onComment((ev) => pushEvent(messageFromEvent(ev, 0)));
    client.onGift((ev, newGifts) => pushEvent(messageFromEvent(ev, newGifts)));
    client.onLike((ev, count) => {
      if (ev.user) likes.add(ev.user.id, ev, count);
    });
    client.connect();
    return () => {
      client.close();
      likes.clear();
      setState({ status: 'idle' });
    };
  }, [port, roomId, push, create, likeQuietMs]);

  return room ? state : { status: 'idle' };
}
