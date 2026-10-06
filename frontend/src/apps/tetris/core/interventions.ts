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
    lastFired: {},
  };
}

export function pendingTotal(team: TeamState): number {
  return Object.values(team.pending).reduce((sum, n) => sum + n, 0);
}

/** Queue one triggered curse. Does not touch hit/gift counters. */
export function addHit(team: TeamState, type: EffectType): void {
  team.pending[type] += 1;
}

/**
 * One settlement: at most one pending curse per queue fires and the rest of its queue keeps
 * waiting. A queue takes turns: the pending type after the one that fired last, in pool order,
 * so no type can starve another. By default every type is its own queue, so each pending type
 * fires.
 */
export function settleTeam(
  team: TeamState,
  pool: readonly EffectType[] = EFFECT_POOL,
  queueOf: (type: EffectType) => string = (type) => type,
): EffectType[] {
  const byQueue = new Map<string, EffectType[]>();
  for (const type of pool) {
    const queue = queueOf(type);
    byQueue.set(queue, [...(byQueue.get(queue) ?? []), type]);
  }
  const chosen = new Set<EffectType>();
  for (const [queue, types] of byQueue) {
    const last = team.lastFired[queue];
    const start = last === undefined ? 0 : types.indexOf(last) + 1;
    const next = [...types.slice(start), ...types.slice(0, start)].find(
      (type) => team.pending[type] > 0,
    );
    if (next === undefined) continue;
    chosen.add(next);
    team.lastFired[queue] = next;
  }
  const fired = pool.filter((type) => chosen.has(type));
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
