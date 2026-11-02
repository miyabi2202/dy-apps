import { EFFECT_POOL, RARITIES, type EffectType, type Rarity } from './curses';
import type { Sender, TeamState } from './types';

/** A fresh team with nothing pending, for every curse type in `pool`. */
export function createTeam(pool: readonly EffectType[] = EFFECT_POOL): TeamState {
  return {
    pending: Object.fromEntries(pool.map((type) => [type, 0])) as Record<EffectType, number>,
    giftCount: 0,
    hitCount: 0,
    missCount: 0,
    firedCount: 0,
    systemCount: 0,
    debugCount: 0,
    likeCount: 0,
    votingCount: 0,
    cancelledCount: 0,
    lastFired: {},
    senders: {},
  };
}

export function pendingTotal(team: TeamState): number {
  return Object.values(team.pending).reduce((sum, n) => sum + n, 0);
}

/** The game itself, as the sender of the curses it draws when the room is quiet. */
export const SYSTEM_SENDER: Sender = { id: 'system', name: '系统' };

/** Queue one triggered curse, from `sender` when known. Does not touch hit/gift counters. */
export function addHit(team: TeamState, type: EffectType, sender?: Sender): void {
  team.pending[type] += 1;
  if (sender) (team.senders[type] ??= []).push(sender);
}

/** Queue a curse the game drew itself because the room was quiet. */
export function addSystemCurse(team: TeamState, type: EffectType): void {
  addHit(team, type, SYSTEM_SENDER);
  team.systemCount += 1;
}

/** Queue a curse added by hand from the debug panel, as if `sender` had sent it. */
export function addDebugCurse(team: TeamState, type: EffectType, sender?: Sender): void {
  addHit(team, type, sender);
  team.debugCount += 1;
}

/** Queue a curse the like meter drew when full, from whoever liked most. */
export function addLikeCurse(team: TeamState, type: EffectType, sender: Sender): void {
  addHit(team, type, sender);
  team.likeCount += 1;
}

/** Who sent the next pending curse of `type`, taking it off the list: call as one fires or is cancelled. */
export function takeSender(team: TeamState, type: EffectType): Sender | null {
  return team.senders[type]?.shift() ?? null;
}

/**
 * Cancel one pending curse: of the rarest rarity that has any, the first in pool order.
 * Returns its type, or null when nothing is pending.
 */
export function cancelOne(
  team: TeamState,
  pool: readonly EffectType[],
  rarityOf: (type: EffectType) => Rarity,
): EffectType | null {
  for (const rarity of [...RARITIES].reverse()) {
    const type = pool.find((t) => rarityOf(t) === rarity && team.pending[t] > 0);
    if (type !== undefined) {
      team.pending[type] -= 1;
      team.cancelledCount += 1;
      return type;
    }
  }
  return null;
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
  const fired = previewSettlement(team, pool, queueOf);
  for (const type of fired) {
    team.pending[type] -= 1;
    team.lastFired[queueOf(type)] = type;
  }
  team.firedCount += fired.length;
  return fired;
}

/** What `settleTeam` would fire now, in pool order, without changing anything. */
export function previewSettlement(
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
    if (next !== undefined) chosen.add(next);
  }
  return pool.filter((type) => chosen.has(type));
}

/**
 * Every gift either missed or triggered, and every curse triggered, drawn by the game, added by
 * hand or drawn by the like meter is pending, fired, cancelled or waiting on a vote.
 */
export function isConserved(team: TeamState): boolean {
  return (
    team.giftCount === team.hitCount + team.missCount &&
    team.hitCount + team.systemCount + team.debugCount + team.likeCount ===
      pendingTotal(team) + team.firedCount + team.cancelledCount + team.votingCount
  );
}
