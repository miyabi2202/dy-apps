import type { GameEngine, GiftResponse } from '../core/game';
import type { GiftBatchInput, Side } from '../core/types';

/**
 * The only gift source in this build: local button clicks turned into
 * GiftBatchInput. A future live-stream adapter would handle event-id dedupe,
 * cumulative-combo deltas and viewer sides before producing the same input.
 */
export class LocalGiftAdapter {
  constructor(private readonly engine: GameEngine) {}

  submit(input: GiftBatchInput): GiftResponse {
    return this.engine.sendGifts(input.side, input.count);
  }

  send(side: Side, count: number): GiftResponse {
    return this.submit({ side, count });
  }
}
