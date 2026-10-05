import {
  connectDyhub,
  GiftCounter,
  LikeBatcher,
  likeCount,
  type DyhubEvent,
  type DyhubStatus,
  type LiveRoom,
} from '@dy-apps/services';
import { useEffect, useState } from 'react';
import { DANMAKU_EVENT_TYPES, likeMessage, messageFromEvent } from './dyhub';
import type { DanmakuMessage } from './types';

export type ConnectDyhub = typeof connectDyhub;

/** DyHub may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

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
  connect: ConnectDyhub = connectDyhub,
  likeQuietMs?: number,
): DyhubState {
  const [state, setState] = useState<DyhubState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    let disconnect = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    const gifts = new GiftCounter();
    const likes = new LikeBatcher<DyhubEvent>({
      quietMs: likeQuietMs,
      onFlush: (last, total) => {
        const message = likeMessage(last, total);
        if (message) push(message);
      },
    });
    const open = () => {
      disconnect = connect(
        port,
        roomId,
        {
          onStatus: (status, detail) => {
            setState({ status, detail });
            if (status === 'error' || status === 'closed') {
              clearTimeout(retry);
              retry = setTimeout(() => {
                disconnect();
                open();
              }, RETRY_MS);
            }
          },
          onEvent: (ev) => {
            if (ev.type === 'like') {
              if (ev.user) likes.add(ev.user.id, ev, likeCount(ev));
              return;
            }
            const message = messageFromEvent(ev, gifts.add(ev));
            if (message) push(message);
          },
        },
        DANMAKU_EVENT_TYPES,
      );
    };
    open();
    return () => {
      clearTimeout(retry);
      likes.clear();
      disconnect();
      setState({ status: 'idle' });
    };
  }, [port, roomId, push, connect, likeQuietMs]);

  return room ? state : { status: 'idle' };
}
