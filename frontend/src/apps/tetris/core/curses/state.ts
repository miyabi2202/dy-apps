import { CONFIG } from '../config';
import type { EffectType } from './index';
import type { CurseDef } from './types';

/** A lasting curse while it lasts: one entry per firing still running, plus its state. */
export interface ActiveCurse {
  /** Locks left on each instance, oldest first. */
  instances: number[];
  state: unknown;
}

export interface EffectsState {
  /** A scenario's base drop-interval multiplier; 1 is normal speed. */
  gravityMultiplier: number;
  /** Lasting curses, while they last. */
  active: Partial<Record<EffectType, ActiveCurse>>;
}

export function createEffects(): EffectsState {
  return { gravityMultiplier: 1, active: {} };
}

/** Locks that `rounds` settlement rounds take. */
export function roundsToLocks(rounds: number): number {
  return rounds * CONFIG.settlement.everyLocks;
}

/** Locks until the last instance ends. */
export function locksLeft(active: ActiveCurse): number {
  return Math.max(0, ...active.instances);
}

/**
 * Start one more instance of `type` for its duration. A curse that was not active gets fresh
 * state; one that was keeps its state and gains an instance.
 */
export function activate(
  effects: EffectsState,
  type: EffectType,
  def: Pick<CurseDef<unknown>, 'durationRounds' | 'initState'>,
): ActiveCurse {
  const locks = roundsToLocks(def.durationRounds ?? 0);
  const current = effects.active[type];
  if (current) {
    current.instances.push(locks);
    return current;
  }
  const fresh: ActiveCurse = { instances: [locks], state: def.initState?.() };
  effects.active[type] = fresh;
  return fresh;
}

/** Called once per lock, before any new effect is applied. */
export function tickTimedEffects(effects: EffectsState): void {
  for (const type of Object.keys(effects.active) as EffectType[]) {
    const timed = effects.active[type]!;
    timed.instances = timed.instances.map((locks) => locks - 1).filter((locks) => locks > 0);
    if (timed.instances.length === 0) delete effects.active[type];
  }
}

/** The drop interval for `totalLines` cleared, times `multiplier`, within the clamps. */
export function gravityIntervalMs(totalLines: number, multiplier: number): number {
  const g = CONFIG.gravity;
  const base = Math.max(g.minBaseMs, g.baseMs - Math.floor(totalLines / g.linesPerStep) * g.stepMs);
  return Math.min(g.maxMs, Math.max(g.minMs, base * multiplier));
}
