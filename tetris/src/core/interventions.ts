import { CONFIG } from './config';
import type { EffectNode, EffectType, IdSource, Level, ReserveEntry, TeamState } from './types';

const Q = CONFIG.queue;

export type HitDestination = 'queue' | 'reserve' | 'overflow';

export interface HitOutcome {
  destination: HitDestination;
  /** Set when the hit caused a node to move forward. */
  promoted: EffectType | null;
}

export interface TeamSettlement {
  /** The node removed from index 0, or null for an empty queue. */
  executed: EffectNode | null;
  /** Effects that moved forward while the reserve strengthened nodes. */
  promotedEffects: EffectType[];
  /** Energy moved from the reserve into the queue. */
  refilledEnergy: number;
}

export function createTeam(): TeamState {
  return {
    queue: [],
    reserve: {},
    giftCount: 0,
    hitCount: 0,
    missCount: 0,
    overflowEnergy: 0,
    spentEnergy: 0,
  };
}

export function levelOf(energy: number): Level {
  const [, lv2, lv3] = Q.levelThresholds;
  if (energy >= lv3) return 3;
  if (energy >= lv2) return 2;
  return 1;
}

/** Pending garbage rows after line-clear cancellation. */
export function netGarbage(node: EffectNode): number {
  return Math.max(0, levelOf(node.energy) - node.canceledLines);
}

export function queueEnergy(team: TeamState): number {
  return team.queue.reduce((sum, node) => sum + node.energy, 0);
}

export function reserveTotal(team: TeamState): number {
  let total = 0;
  for (const entry of Object.values(team.reserve)) total += entry.energy;
  return total;
}

/** Reserve entries ordered by when each type first entered the (empty) reserve. */
export function reserveInOrder(team: TeamState): [EffectType, ReserveEntry][] {
  return (Object.entries(team.reserve) as [EffectType, ReserveEntry][]).sort(
    (a, b) => a[1].firstQueuedOrder - b[1].firstQueuedOrder,
  );
}

/** Index of the unlocked (index >= 1) node of `type`, or -1. */
function unlockedIndexOf(team: TeamState, type: EffectType): number {
  for (let i = 1; i < team.queue.length; i += 1) {
    if (team.queue[i]!.type === type) return i;
  }
  return -1;
}

function createNode(ids: IdSource, type: EffectType, energy: number): EffectNode {
  return {
    id: ids.nextNodeId(),
    type,
    energy,
    waitedSettlements: 0,
    promoted: false,
    canceledLines: 0,
  };
}

/**
 * Move the node at `index` forward one slot if every rule allows it.
 * Never crosses the locked slot; failure keeps the node's eligibility.
 */
export function tryPromote(team: TeamState, index: number): boolean {
  if (index < 2 || index >= team.queue.length) return false;
  const node = team.queue[index]!;
  const ahead = team.queue[index - 1]!;
  if (node.promoted) return false;
  if (levelOf(node.energy) < Q.promoteMinLevel) return false;
  if (ahead.waitedSettlements >= Q.waitProtection) return false;
  team.queue[index - 1] = node;
  team.queue[index] = ahead;
  node.promoted = true;
  return true;
}

function addToReserve(team: TeamState, ids: IdSource, type: EffectType, energy: number): void {
  const entry = team.reserve[type];
  if (entry) entry.energy += energy;
  else team.reserve[type] = { energy, firstQueuedOrder: ids.nextReserveOrder() };
}

/** Apply one triggered gift (1 energy) of `type`. Does not touch hit/gift counters. */
export function addHit(team: TeamState, type: EffectType, ids: IdSource): HitOutcome {
  const index = unlockedIndexOf(team, type);
  if (index >= 0) {
    const node = team.queue[index]!;
    if (node.energy < Q.nodeMaxEnergy) {
      node.energy += 1;
      return { destination: 'queue', promoted: tryPromote(team, index) ? type : null };
    }
  } else if (team.queue.length < Q.capacity) {
    team.queue.push(createNode(ids, type, 1));
    const promoted = tryPromote(team, team.queue.length - 1);
    return { destination: 'queue', promoted: promoted ? type : null };
  }

  if (reserveTotal(team) < Q.reserveCapacity) {
    addToReserve(team, ids, type, 1);
    return { destination: 'reserve', promoted: null };
  }
  team.overflowEnergy += 1;
  return { destination: 'overflow', promoted: null };
}

/**
 * Cancel up to `lines` pending garbage rows, nearest node first (locked slot included).
 * Fully cancelled nodes stay in place. Returns rows cancelled.
 */
export function cancelGarbage(team: TeamState, lines: number): number {
  let remaining = lines;
  for (const node of team.queue) {
    if (remaining <= 0) break;
    if (node.type !== 'garbage') continue;
    const c = Math.min(netGarbage(node), remaining);
    node.canceledLines += c;
    remaining -= c;
  }
  return lines - remaining;
}

/** One settlement for one team: pop the head, age the rest, refill from the reserve. */
export function settleTeam(team: TeamState, ids: IdSource): TeamSettlement {
  const executed = team.queue.shift() ?? null;
  if (executed) team.spentEnergy += executed.energy;
  for (const node of team.queue) node.waitedSettlements += 1;

  const promotedEffects: EffectType[] = [];
  let refilledEnergy = 0;

  // Strengthen existing unlocked nodes, in reserve order.
  for (const [type, entry] of reserveInOrder(team)) {
    const index = unlockedIndexOf(team, type);
    if (index < 0) continue;
    const node = team.queue[index]!;
    const moved = Math.min(entry.energy, Q.nodeMaxEnergy - node.energy);
    if (moved <= 0) continue;
    node.energy += moved;
    entry.energy -= moved;
    refilledEnergy += moved;
    if (tryPromote(team, index)) promotedEffects.push(type);
  }

  // Create new nodes, at most one per type, without promotion.
  for (const [type, entry] of reserveInOrder(team)) {
    if (team.queue.length >= Q.capacity) break;
    if (entry.energy <= 0 || unlockedIndexOf(team, type) >= 0) continue;
    const energy = Math.min(entry.energy, Q.nodeMaxEnergy);
    team.queue.push(createNode(ids, type, energy));
    entry.energy -= energy;
    refilledEnergy += energy;
  }

  for (const [type, entry] of Object.entries(team.reserve) as [EffectType, ReserveEntry][]) {
    if (entry.energy <= 0) delete team.reserve[type];
  }

  return { executed, promotedEffects, refilledEnergy };
}

/** Both conservation invariants from §7.3. */
export function isConserved(team: TeamState): boolean {
  return (
    team.giftCount === team.hitCount + team.missCount &&
    team.hitCount ===
      queueEnergy(team) + reserveTotal(team) + team.spentEnergy + team.overflowEnergy
  );
}
