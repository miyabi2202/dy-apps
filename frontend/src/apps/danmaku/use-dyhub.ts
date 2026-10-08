import {
  DyhubClient,
  type DyhubSocket,
  LikeBatcher,
  type DyhubLikeEvent,
  type DyhubState,
  likeMessage,
  messageFromEvent,
  type DanmakuMessage,
  type Logger,
  type LiveRoom,
} from '@dy-apps/services';
import { useEffect, useState } from 'react';
import { log as moduleLog } from './log';

/** DyHub may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

/** Makes the client for a room; tests pass one with a fake socket. */
export type CreateDyhubClient = (room: LiveRoom) => DyhubClient;

export const createDyhubClient = (
  room: LiveRoom,
  openSocket?: (url: string) => DyhubSocket,
): DyhubClient => new DyhubClient({ ...room, retryMs: RETRY_MS, openSocket });

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
  log: Logger = moduleLog,
): DyhubState {
  const [state, setState] = useState<DyhubState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    log.debug(`dyhub: connecting to ws://localhost:${port}/ws?roomId=${roomId}`);
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
    client.onStatus((status, detail) => {
      setState({ status, detail });
      const info = detail ? `${status} (${detail})` : status;
      if (status === 'error' || status === 'closed') {
        log.debug(`dyhub: ${info}, retrying in ${RETRY_MS}ms`);
      } else log.debug(`dyhub: ${info}`);
    });
    client.onComment((ev) => pushEvent(messageFromEvent(ev, 0)));
    client.onGift((ev, newGifts) => pushEvent(messageFromEvent(ev, newGifts)));
    client.onLike((ev, count) => {
      if (ev.user) likes.add(ev.user.id, ev, count);
    });
    client.connect();
    return () => {
      log.debug('dyhub: closing the connection');
      client.close();
      likes.clear();
      setState({ status: 'idle' });
    };
  }, [port, roomId, push, create, likeQuietMs, log]);

  return room ? state : { status: 'idle' };
}
