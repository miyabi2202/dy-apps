import {
  createFakeGift,
  fakeGiftAt,
  type DanmakuMessage,
  type DemoConfig,
  type LiveRoom,
} from '@dy-apps/services';
import { useDemo, type CreateRoomFeedClient, type RoomFeedState } from '@dy-apps/ui';
import { useCallback, useEffect } from 'react';
import type { RoomEvents } from './room-events';
import { log } from './log';
import { useLiveRoom } from './use-live-room';

export interface GiftSourceOptions {
  /** Fake gifts at an interval, or the live room's. */
  demo: DemoConfig;
  /** The live room; needed for the live source. */
  room: LiveRoom | null;
  running: boolean;
  /** Where the gifts (and, from a live room, chat and likes) go. */
  events: RoomEvents;
  /** Makes a fake gift; tests pass a fixed one. */
  fakeGift?: () => DanmakuMessage;
  createClient?: CreateRoomFeedClient;
}

/**
 * While running, sends gifts into the game through `events`: made-up viewers' gifts at
 * uneven intervals (or, with `demo.random` false, in list order at a fixed one), or every
 * gift from the live room.
 */
export function useGiftSource({
  demo,
  room,
  running,
  events,
  fakeGift = createFakeGift,
  createClient,
}: GiftSourceOptions): RoomFeedState {
  // `?random=0`: the fake gifts in list order at a fixed interval, the same every run.
  const random = demo.random !== false;
  const sendFake = useCallback(
    (n: number) => events.gift(random ? fakeGift() : fakeGiftAt(n)),
    [events, fakeGift, random],
  );
  useEffect(() => {
    if (!running) return;
    log.debug(
      demo.source === 'fake'
        ? `gift source: fake gifts about every ${demo.intervalMs} ms${random ? '' : ' in fixed order'}`
        : `gift source: live room ${room?.roomId ?? '(none)'}`,
    );
    return () => log.debug('gift source: stopped');
  }, [running, demo.source, demo.intervalMs, random, room?.roomId]);
  useDemo(
    running && demo.source === 'fake',
    demo.intervalMs,
    sendFake,
    random ? Math.random : null,
  );
  return useLiveRoom(running && demo.source === 'live' ? room : null, events, createClient);
}
