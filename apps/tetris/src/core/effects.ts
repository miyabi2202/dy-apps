import { addGarbageRows } from './board';
import { CONFIG } from './config';
import type { Rng } from './random';
import type { Board, EffectType, TimedPieceEffect } from './types';

export interface EffectsState {
  /** Product of every haste applied this game; 1 means no haste. Never expires. */
  hasteMultiplier: number;
  fog: TimedPieceEffect | null;
  seal: TimedPieceEffect | null;
}

export type TimedKey = 'fog' | 'seal';
export const TIMED_KEYS: readonly TimedKey[] = ['fog', 'seal'];

export function createEffects(): EffectsState {
  return { hasteMultiplier: 1, fog: null, seal: null };
}

/** Called once per lock, before any new effect is applied. */
export function tickTimedEffects(effects: EffectsState): void {
  for (const key of TIMED_KEYS) {
    const timed = effects[key];
    if (!timed) continue;
    timed.remainingLocks -= 1;
    if (timed.remainingLocks <= 0) effects[key] = null;
  }
}

export function gravityIntervalMs(totalLines: number, effects: EffectsState): number {
  const g = CONFIG.gravity;
  const base = Math.max(g.minBaseMs, g.baseMs - Math.floor(totalLines / g.linesPerStep) * g.stepMs);
  return Math.min(g.maxMs, Math.max(g.minMs, base * effects.hasteMultiplier));
}

export interface CurseOutcome {
  /** True when garbage pushed blocks off the top. */
  toppedOut: boolean;
}

/** Fire one curse. */
export function applyCurse(
  effects: EffectsState,
  board: Board,
  type: EffectType,
  garbageRng: Rng,
): CurseOutcome {
  switch (type) {
    case 'garbage':
      return { toppedOut: addGarbageRows(board, 1, garbageRng) };
    case 'haste':
      effects.hasteMultiplier *= CONFIG.gravity.hasteMultiplier;
      break;
    case 'fog':
      effects.fog = { remainingLocks: CONFIG.effects.fogLocks };
      break;
    case 'seal':
      effects.seal = { remainingLocks: CONFIG.effects.sealLocks };
      break;
  }
  return { toppedOut: false };
}
