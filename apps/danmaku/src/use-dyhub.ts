import { connectDyhub, GiftCounter, type DyhubStatus } from '@dy-apps/dyhub-client';
import { useEffect, useState } from 'react';
import { messageFromEvent, type LiveRoom } from './dyhub';
import type { DanmakuMessage } from './types';

export type ConnectDyhub = typeof connectDyhub;

/** DyHub may start after the page (OBS often opens first), so keep trying. */
const RETRY_MS = 5000;

export interface DyhubState {
  status: DyhubStatus | 'idle';
  detail?: string;
}

/**
 * Stays connected to `room` while it's set, pushing each chat message and gift. When the
 * connection fails or drops, it tries again after a few seconds.
 */
export function useDyhub(
  room: LiveRoom | null,
  push: (m: DanmakuMessage) => void,
  connect: ConnectDyhub = connectDyhub,
): DyhubState {
  const [state, setState] = useState<DyhubState>({ status: 'idle' });
  const port = room?.port;
  const roomId = room?.roomId;

  useEffect(() => {
    if (port === undefined || roomId === undefined) return;
    let disconnect = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    const gifts = new GiftCounter();
    const open = () => {
      disconnect = connect(port, roomId, {
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
          const message = messageFromEvent(ev, gifts.add(ev));
          if (message) push(message);
        },
      });
    };
    open();
    return () => {
      clearTimeout(retry);
      disconnect();
      setState({ status: 'idle' });
    };
  }, [port, roomId, push, connect]);

  return room ? state : { status: 'idle' };
}
