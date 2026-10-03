import { addGarbageRows, removeBottomRows } from './board';
import { CONFIG } from './config';
import { levelOf, netGarbage } from './interventions';
import type { Rng } from './random';
import type { Board, EffectNode, TimedPieceEffect } from './types';

const E = CONFIG.effects;

export interface EffectsState {
  shield: number;
  /** Upcoming spawns from the sequence that become I pieces. */
  longCredits: number;
  slow: TimedPieceEffect | null;
  haste: TimedPieceEffect | null;
  fog: TimedPieceEffect | null;
  seal: TimedPieceEffect | null;
}

export type TimedKey = 'slow' | 'haste' | 'fog' | 'seal';
export const TIMED_KEYS: readonly TimedKey[] = ['slow', 'haste', 'fog', 'seal'];

export function createEffects(): EffectsState {
  return { shield: 0, longCredits: 0, slow: null, haste: null, fog: null, seal: null };
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
  const slow = effects.slow ? 1 + g.slowPerLevel * effects.slow.level : 1;
  const haste = effects.haste ? g.hasteMultipliers[effects.haste.level - 1]! : 1;
  return Math.min(g.maxMs, Math.max(g.minMs, base * slow * haste));
}

export interface BlessOutcome {
  shieldAdded: number;
  rowsCleared: number;
  longAdded: number;
}

export function applyBless(effects: EffectsState, board: Board, node: EffectNode): BlessOutcome {
  const level = levelOf(node.energy);
  const out: BlessOutcome = { shieldAdded: 0, rowsCleared: 0, longAdded: 0 };
  switch (node.type) {
    case 'shield': {
      const before = effects.shield;
      effects.shield = Math.min(E.shieldMax, effects.shield + level);
      out.shieldAdded = effects.shield - before;
      break;
    }
    case 'clear':
      removeBottomRows(board, level);
      out.rowsCleared = level;
      break;
    case 'long': {
      const before = effects.longCredits;
      effects.longCredits = Math.min(E.longMaxCredits, effects.longCredits + level);
      out.longAdded = effects.longCredits - before;
      break;
    }
    case 'slow':
      effects.slow = { level, remainingLocks: E.timedLocks };
      break;
    default:
      throw new Error(`Not a bless effect: ${node.type}`);
  }
  return out;
}

export interface CurseOutcome {
  /** Garbage rows still pending after line-clear cancellation. */
  rawGarbage: number;
  shieldAbsorbed: number;
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
  const out: CurseOutcome = { rawGarbage: 0, shieldAbsorbed: 0, netGarbage: 0, toppedOut: false };
  switch (node.type) {
    case 'garbage': {
      out.rawGarbage = netGarbage(node);
      out.shieldAbsorbed = Math.min(effects.shield, out.rawGarbage);
      effects.shield -= out.shieldAbsorbed;
      out.netGarbage = out.rawGarbage - out.shieldAbsorbed;
      out.toppedOut = addGarbageRows(board, out.netGarbage, garbageRng);
      break;
    }
    case 'haste':
      effects.haste = { level, remainingLocks: E.timedLocks };
      break;
    case 'fog':
      effects.fog = { level, remainingLocks: level };
      break;
    case 'seal':
      effects.seal = { level, remainingLocks: level };
      break;
    default:
      throw new Error(`Not a curse effect: ${node.type}`);
  }
  return out;
}
