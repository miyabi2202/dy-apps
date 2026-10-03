import { addGarbageRows } from './board';
import { CONFIG } from './config';
import { levelOf, netGarbage } from './interventions';
import type { Rng } from './random';
import type { Board, EffectNode, TimedPieceEffect } from './types';

const E = CONFIG.effects;

export interface EffectsState {
  haste: TimedPieceEffect | null;
  fog: TimedPieceEffect | null;
  seal: TimedPieceEffect | null;
}

export type TimedKey = 'haste' | 'fog' | 'seal';
export const TIMED_KEYS: readonly TimedKey[] = ['haste', 'fog', 'seal'];

export function createEffects(): EffectsState {
  return { haste: null, fog: null, seal: null };
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
  const haste = effects.haste ? g.hasteMultipliers[effects.haste.level - 1]! : 1;
  return Math.min(g.maxMs, Math.max(g.minMs, base * haste));
}

export interface CurseOutcome {
  /** Garbage rows added, after line-clear cancellation. */
  netGarbage: number;
  /** True when garbage pushed blocks off the top. */
  toppedOut: boolean;
}

export function applyCurse(
  effects: EffectsState,
  board: Board,
  node: EffectNode,
  garbageRng: Rng,
): CurseOutcome {
  const level = levelOf(node.energy);
  const out: CurseOutcome = { netGarbage: 0, toppedOut: false };
  switch (node.type) {
    case 'garbage':
      out.netGarbage = netGarbage(node);
      out.toppedOut = addGarbageRows(board, out.netGarbage, garbageRng);
      break;
    case 'haste':
      effects.haste = { level, remainingLocks: E.timedLocks };
      break;
    case 'fog':
      effects.fog = { level, remainingLocks: level };
      break;
    case 'seal':
      effects.seal = { level, remainingLocks: level };
      break;
  }
  return out;
}
