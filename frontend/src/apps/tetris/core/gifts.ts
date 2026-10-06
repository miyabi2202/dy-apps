import { CONFIG } from './config';
import { CURSE_LIST, type CurseDef, type EffectType, type Rarity } from './curses';
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

/** The rarities in weight order. */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare'];

/** A slice of [0, 1) that one rarity's draw lands in, with the curses it can pick. */
export interface RarityBand {
  rarity: Rarity;
  from: number;
  to: number;
  types: EffectType[];
}

/**
 * How a hit's rarity draw splits [0, 1) for `curses`. Rarities with no curse in play get no band,
 * and the configured weights are scaled over the ones left.
 */
export function rarityBands(curses: readonly CurseDef<unknown>[]): RarityBand[] {
  const weights = CONFIG.gifts.rarityWeights;
  const present = RARITIES.filter((r) => curses.some((def) => def.rarity === r));
  const total = present.reduce((sum, r) => sum + weights[r], 0);
  let from = 0;
  return present.map((rarity, i) => {
    // The last band ends at exactly 1, whatever rounding the sums picked up.
    const to = i === present.length - 1 ? 1 : from + weights[rarity] / total;
    const band: RarityBand = {
      rarity,
      from,
      to,
      types: curses.filter((def) => def.rarity === rarity).map((def) => def.type),
    };
    from = to;
    return band;
  });
}

/** Two draws: a rarity by weight, then one of its curses evenly. */
export function drawCurse(rng: Rng, bands: readonly RarityBand[]): EffectType {
  const u = rng.next();
  const band = bands.find((b) => u < b.to) ?? bands[bands.length - 1]!;
  return band.types[randomInt(rng, band.types.length)]!;
}

/**
 * Resolve a batch of draws (one per diamond of gifts) one at a time, in order, using the probability
 * snapshot `probability`. Each diamond takes three draws: `u < p` hits, a rarity by weight, then
 * one of that rarity's curses evenly.
 */
export function processGiftBatch(
  team: TeamState,
  sender: string,
  count: number,
  probability: number,
  rng: Rng,
  curses: readonly CurseDef<unknown>[] = CURSE_LIST,
): GiftBatchResult {
  if (curses.length === 0) throw new RangeError('No curses to draw from');
  const bands = rarityBands(curses);
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
    const type = drawCurse(rng, bands);
    team.hitCount += 1;
    result.hits += 1;
    result.effects[type] = (result.effects[type] ?? 0) + 1;
    addHit(team, type);
  }
  return result;
}
