import {
  createFakeGift,
  fakeGiftAt,
  type DanmakuMessage,
  type DemoConfig,
  type DyhubState,
  type LiveRoom,
} from '@dy-apps/services';
import { useDemo } from '@dy-apps/ui';
import { useCallback } from 'react';
import type { GiftFeed } from './gift-feed';
import { useLiveGifts, type CreateDyhubClient } from './use-live-gifts';

export interface GiftSourceOptions {
  /** Fake gifts at an interval, or the live room's. */
  demo: DemoConfig;
  /** The live room; needed for the live source. */
  room: LiveRoom | null;
  running: boolean;
  feed: GiftFeed;
  /** Makes a fake gift; tests pass a fixed one. */
  fakeGift?: () => DanmakuMessage;
  createClient?: CreateDyhubClient;
}

/**
 * While running, sends gifts into the game through `feed`: made-up viewers' gifts at
 * uneven intervals (or, with `demo.random` false, in list order at a fixed one), or every
 * gift from the live room.
 */
export function useGiftSource({
  demo,
  room,
  running,
  feed,
  fakeGift = createFakeGift,
  createClient,
}: GiftSourceOptions): DyhubState {
  // `?random=0`: the fake gifts in list order at a fixed interval, the same every run.
  const random = demo.random !== false;
  const sendFake = useCallback(
    (n: number) => feed.send(random ? fakeGift() : fakeGiftAt(n)),
    [feed, fakeGift, random],
  );
  useDemo(
    running && demo.source === 'fake',
    demo.intervalMs,
    sendFake,
    random ? Math.random : null,
  );
  return useLiveGifts(running && demo.source === 'live' ? room : null, feed, createClient);
}
