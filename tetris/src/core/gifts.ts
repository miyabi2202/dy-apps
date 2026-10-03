import { CONFIG, EFFECT_POOLS } from './config';
import { addHit } from './interventions';
import { randomInt, type Rng } from './random';
import type { GiftBatchResult, IdSource, Side, TeamState } from './types';

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
 * Resolve a batch of 星光 gifts one at a time, in order, using the probability
 * snapshot `probability`. Each gift: `u < p` hits, then a second draw picks one
 * of the side's four effects uniformly.
 */
export function processGiftBatch(
  team: TeamState,
  side: Side,
  count: number,
  probability: number,
  rng: Rng,
  ids: IdSource,
): GiftBatchResult {
  if (!isValidBatchCount(count)) throw new RangeError(`Invalid gift count: ${String(count)}`);
  const pool = EFFECT_POOLS[side];
  const result: GiftBatchResult = {
    side,
    count,
    triggerProbability: probability,
    hits: 0,
    misses: 0,
    effects: {},
    queuedEnergy: 0,
    reservedEnergy: 0,
    overflowEnergy: 0,
    promotions: 0,
    promotedEffects: [],
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

    const outcome = addHit(team, type, ids);
    if (outcome.destination === 'queue') result.queuedEnergy += 1;
    else if (outcome.destination === 'reserve') result.reservedEnergy += 1;
    else result.overflowEnergy += 1;
    if (outcome.promoted) {
      result.promotions += 1;
      result.promotedEffects.push(outcome.promoted);
    }
  }
  return result;
}
