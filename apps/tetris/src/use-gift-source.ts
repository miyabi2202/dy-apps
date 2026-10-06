import {
  createFakeGift,
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
 * While running, sends gifts into the game through `feed`: made-up viewers sending gifts
 * of random sizes at random intervals, or every gift from the live room.
 */
export function useGiftSource({
  demo,
  room,
  running,
  feed,
  fakeGift = createFakeGift,
  createClient,
}: GiftSourceOptions): DyhubState {
  const sendFake = useCallback(() => feed.send(fakeGift()), [feed, fakeGift]);
  useDemo(running && demo.source === 'fake', demo.intervalMs, sendFake);
  return useLiveGifts(running && demo.source === 'live' ? room : null, feed, createClient);
}
