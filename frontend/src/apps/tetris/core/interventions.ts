import { EFFECT_POOL, type EffectType } from './curses';
import type { TeamState } from './types';

/** A fresh team with nothing pending, for every curse type. */
export function createTeam(): TeamState {
  return {
    pending: Object.fromEntries(EFFECT_POOL.map((type) => [type, 0])) as Record<EffectType, number>,
    giftCount: 0,
    hitCount: 0,
    missCount: 0,
    firedCount: 0,
  };
}

export function pendingTotal(team: TeamState): number {
  return Object.values(team.pending).reduce((sum, n) => sum + n, 0);
}

/** Queue one triggered curse. Does not touch hit/gift counters. */
export function addHit(team: TeamState, type: EffectType): void {
  team.pending[type] += 1;
}

/** One settlement: every curse type with anything pending fires once. */
export function settleTeam(
  team: TeamState,
  pool: readonly EffectType[] = EFFECT_POOL,
): EffectType[] {
  const fired = pool.filter((type) => team.pending[type] > 0);
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
