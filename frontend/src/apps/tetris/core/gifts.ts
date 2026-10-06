import { CONFIG } from './config';
import { EFFECT_POOL, type EffectType } from './curses';
import { addHit } from './interventions';
import { randomInt, type Rng } from './random';
import type { GiftBatchResult, TeamState } from './types';

export function isValidBatchCount(count: unknown): count is number {
  return (
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= CONFIG.gifts.minBatch &&
    count <= CONFIG.gifts.maxBatch
  );
}

export function isValidProbability(p: unknown): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1;
}

/**
 * Resolve a batch of draws (one per diamond of gifts) one at a time, in order, using the probability
 * snapshot `probability`. Each gift: `u < p` hits, then a second draw picks one
 * of the curses in `pool` uniformly.
 */
export function processGiftBatch(
  team: TeamState,
  sender: string,
  count: number,
  probability: number,
  rng: Rng,
  pool: readonly EffectType[] = EFFECT_POOL,
): GiftBatchResult {
  if (!isValidBatchCount(count)) throw new RangeError(`Invalid gift count: ${String(count)}`);
  const result: GiftBatchResult = {
    sender,
    count,
    triggerProbability: probability,
    hits: 0,
    misses: 0,
    effects: {},
  };

  for (let i = 0; i < count; i += 1) {
    team.giftCount += 1;
    if (!(rng.next() < probability)) {
      team.missCount += 1;
      result.misses += 1;
      continue;
    }
    const type = pool[randomInt(rng, pool.length)]!;
    team.hitCount += 1;
    result.hits += 1;
    result.effects[type] = (result.effects[type] ?? 0) + 1;
    addHit(team, type);
  }
  return result;
}
