import type { GameEngine, GiftResponse } from '../core/game';
import type { GiftBatchInput } from '../core/types';

/** Placeholder sender until a live-stream adapter supplies real viewer names. */
export const LOCAL_SENDER = 'foo';

/**
 * The only gift source in this build: local button clicks turned into
 * GiftBatchInput. A future live-stream adapter would handle event-id dedupe
 * and cumulative-combo deltas before producing the same input.
 */
export class LocalGiftAdapter {
  constructor(private readonly engine: GameEngine) {}

  submit(input: GiftBatchInput): GiftResponse {
    return this.engine.sendGifts(input.sender, input.count);
  }

  send(count: number): GiftResponse {
    return this.submit({ sender: LOCAL_SENDER, count });
  }
}
