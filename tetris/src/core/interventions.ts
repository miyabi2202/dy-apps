import { EFFECT_POOL } from './config';
import type { EffectType, TeamState } from './types';

export function createTeam(): TeamState {
  return {
    pending: { garbage: 0, haste: 0, fog: 0, seal: 0 },
    giftCount: 0,
    hitCount: 0,
    missCount: 0,
    firedCount: 0,
  };
}

export function pendingTotal(team: TeamState): number {
  return EFFECT_POOL.reduce((sum, type) => sum + team.pending[type], 0);
}

/** Queue one triggered curse. Does not touch hit/gift counters. */
export function addHit(team: TeamState, type: EffectType): void {
  team.pending[type] += 1;
}

/** One settlement: every curse type with anything pending fires once. */
export function settleTeam(team: TeamState): EffectType[] {
  const fired = EFFECT_POOL.filter((type) => team.pending[type] > 0);
  for (const type of fired) team.pending[type] -= 1;
  team.firedCount += fired.length;
  return fired;
}

/** Every gift either missed or triggered, and every triggered curse is pending or fired. */
export function isConserved(team: TeamState): boolean {
  return (
    team.giftCount === team.hitCount + team.missCount &&
    team.hitCount === pendingTotal(team) + team.firedCount
  );
}
