import { CONFIG } from '../config';
import type { EffectType } from './index';
import type { CurseDef } from './types';

/** A curse that lasts some locks, with whatever state it keeps while active. */
export interface ActiveCurse {
  remainingLocks: number;
  state: unknown;
}

export interface EffectsState {
  /** Product of every haste applied this game; 1 means no haste. Never expires. */
  hasteMultiplier: number;
  /** Curses that last some locks, while they last. */
  active: Partial<Record<EffectType, ActiveCurse>>;
}

export function createEffects(): EffectsState {
  return { hasteMultiplier: 1, active: {} };
}

/**
 * Make `type` active for its duration, or restart its count if it already is. A curse that
 * was not active gets fresh state; one that was keeps its state.
 */
export function activate(
  effects: EffectsState,
  type: EffectType,
  def: Pick<CurseDef<unknown>, 'durationLocks' | 'initState'>,
): ActiveCurse {
  const remainingLocks = def.durationLocks ?? 0;
  const current = effects.active[type];
  if (current) {
    current.remainingLocks = remainingLocks;
    return current;
  }
  const fresh: ActiveCurse = { remainingLocks, state: def.initState?.() };
  effects.active[type] = fresh;
  return fresh;
}

/** Called once per lock, before any new effect is applied. */
export function tickTimedEffects(effects: EffectsState): void {
  for (const type of Object.keys(effects.active) as EffectType[]) {
    const timed = effects.active[type]!;
    timed.remainingLocks -= 1;
    if (timed.remainingLocks <= 0) delete effects.active[type];
  }
}

export function gravityIntervalMs(totalLines: number, effects: EffectsState): number {
  const g = CONFIG.gravity;
  const base = Math.max(g.minBaseMs, g.baseMs - Math.floor(totalLines / g.linesPerStep) * g.stepMs);
  return Math.min(g.maxMs, Math.max(g.minMs, base * effects.hasteMultiplier));
}
