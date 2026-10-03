import {
  addHit,
  cancelGarbage,
  createTeam,
  isConserved,
  levelOf,
  netGarbage,
  queueEnergy,
  reserveTotal,
  settleTeam,
  tryPromote,
} from '../../src/core/interventions';
import type { EffectType, TeamState } from '../../src/core/types';
import { makeIds, makeNode } from '../helpers';

function hit(team: TeamState, type: EffectType, ids = makeIds(), times = 1) {
  for (let i = 0; i < times; i += 1) {
    team.giftCount += 1;
    team.hitCount += 1;
    addHit(team, type, ids);
  }
}

describe('levels', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [6, 2],
    [7, 3],
  ])('energy %i is Lv.%i', (energy, level) => {
    expect(levelOf(energy)).toBe(level);
  });
});

describe('example B: locked head and same-type merging', () => {
  it('10 forced shields: locked 1, second slot 7, reserve 2', () => {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'shield', ids, 10);
    expect(team.queue.map((n) => [n.type, n.energy])).toEqual([
      ['shield', 1],
      ['shield', 7],
    ]);
    expect(levelOf(team.queue[0]!.energy)).toBe(1);
    expect(levelOf(team.queue[1]!.energy)).toBe(3);
    expect(team.reserve.shield?.energy).toBe(2);
    expect(team.overflowEnergy).toBe(0);
    expect(isConserved(team)).toBe(true);
  });

  it('100 forced shields: queue 1+7, reserve 21, overflow 71', () => {
    const team = createTeam();
    hit(team, 'shield', makeIds(), 100);
    expect(queueEnergy(team)).toBe(8);
    expect(reserveTotal(team)).toBe(21);
    expect(team.overflowEnergy).toBe(71);
    expect(team.hitCount).toBe(100);
    expect(isConserved(team)).toBe(true);
  });

  it('never strengthens the locked slot', () => {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'garbage', ids);
    hit(team, 'fog', ids);
    hit(team, 'haste', ids);
    hit(team, 'garbage', ids, 5);
    expect(team.queue[0]!.energy).toBe(1);
    expect(team.reserve.garbage?.energy).toBe(5);
  });

  it('only one unlocked node per type; full queue sends hits to reserve', () => {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'shield', ids);
    hit(team, 'clear', ids);
    hit(team, 'long', ids);
    hit(team, 'slow', ids);
    expect(team.queue.map((n) => n.type)).toEqual(['shield', 'clear', 'long']);
    expect(team.reserve.slow?.energy).toBe(1);
  });
});

describe('example C: promotion', () => {
  function setup() {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'garbage', ids);
    hit(team, 'fog', ids);
    hit(team, 'haste', ids);
    return { team, ids };
  }

  it('haste reaching Lv.2 jumps ahead of fog once', () => {
    const { team, ids } = setup();
    expect(team.queue.map((n) => n.type)).toEqual(['garbage', 'fog', 'haste']);
    hit(team, 'haste', ids, 2);
    expect(team.queue.map((n) => n.type)).toEqual(['garbage', 'haste', 'fog']);
    expect(team.queue[1]!.promoted).toBe(true);
    expect(levelOf(team.queue[1]!.energy)).toBe(2);
  });

  it('cannot overtake a node that has waited two settlements', () => {
    const { team, ids } = setup();
    team.queue[1]!.waitedSettlements = 2;
    hit(team, 'haste', ids, 2);
    expect(team.queue.map((n) => n.type)).toEqual(['garbage', 'fog', 'haste']);
    // Failure keeps eligibility.
    expect(team.queue[2]!.promoted).toBe(false);
    team.queue[1]!.waitedSettlements = 1;
    hit(team, 'haste', ids);
    expect(team.queue.map((n) => n.type)).toEqual(['garbage', 'haste', 'fog']);
  });

  it('never crosses the locked slot and promotes at most once', () => {
    const team = createTeam();
    team.queue = [
      makeNode('garbage', 1),
      makeNode('haste', 5, { promoted: true }),
      makeNode('fog', 3),
    ];
    expect(tryPromote(team, 1)).toBe(false);
    expect(tryPromote(team, 2)).toBe(true);
    expect(team.queue.map((n) => n.type)).toEqual(['garbage', 'fog', 'haste']);
    expect(tryPromote(team, 2)).toBe(false);
  });

  it('Lv.1 nodes do not promote', () => {
    const team = createTeam();
    team.queue = [makeNode('garbage', 1), makeNode('fog', 1), makeNode('haste', 2)];
    expect(tryPromote(team, 2)).toBe(false);
  });
});

describe('settlement and reserve refill', () => {
  it('pops the head, ages the rest, and empty queues still settle', () => {
    const team = createTeam();
    expect(settleTeam(team, makeIds()).executed).toBeNull();
    team.queue = [makeNode('shield', 2), makeNode('clear', 1)];
    const r = settleTeam(team, makeIds());
    expect(r.executed?.type).toBe('shield');
    expect(team.spentEnergy).toBe(2);
    expect(team.queue[0]!.waitedSettlements).toBe(1);
  });

  it('strengthens unlocked nodes, but not the new head', () => {
    const team = createTeam();
    team.queue = [makeNode('shield', 1), makeNode('clear', 1), makeNode('slow', 1)];
    team.reserve = {
      clear: { energy: 4, firstQueuedOrder: 1 },
      slow: { energy: 10, firstQueuedOrder: 2 },
    };
    settleTeam(team, makeIds());
    // clear became the locked head: not strengthened. slow is unlocked: +6 to 7.
    expect(team.queue.map((n) => [n.type, n.energy])).toEqual([
      ['clear', 1],
      ['slow', 7],
      ['clear', 4],
    ]);
    expect(team.reserve).toEqual({ slow: { energy: 4, firstQueuedOrder: 2 } });
  });

  it('creates nodes in reserve order, max one per type and 7 energy each', () => {
    const team = createTeam();
    team.queue = [makeNode('shield', 1)];
    team.reserve = {
      long: { energy: 9, firstQueuedOrder: 5 },
      clear: { energy: 2, firstQueuedOrder: 3 },
    };
    settleTeam(team, makeIds());
    expect(team.queue.map((n) => [n.type, n.energy, n.waitedSettlements])).toEqual([
      ['clear', 2, 0],
      ['long', 7, 0],
    ]);
    expect(team.reserve).toEqual({ long: { energy: 2, firstQueuedOrder: 5 } });
  });

  // With capacity 3, at most two nodes remain after the pop, so this exercises the
  // capacity-independent path by starting from an over-full queue.
  it('strengthening can trigger a promotion (generic path)', () => {
    const team = createTeam();
    team.queue = [
      makeNode('garbage', 1),
      makeNode('fog', 1),
      makeNode('haste', 1),
      makeNode('seal', 1),
    ];
    team.reserve = { haste: { energy: 2, firstQueuedOrder: 1 } };
    const r = settleTeam(team, makeIds());
    expect(team.queue.map((n) => n.type)).toEqual(['fog', 'haste', 'seal']);
    // haste is now index 1, so promotion is not possible (would cross the lock).
    expect(r.promotedEffects).toEqual([]);

    const team2 = createTeam();
    team2.queue = [
      makeNode('garbage', 1),
      makeNode('seal', 1),
      makeNode('fog', 1),
      makeNode('haste', 1),
    ];
    team2.reserve = { haste: { energy: 2, firstQueuedOrder: 1 } };
    const r2 = settleTeam(team2, makeIds());
    expect(team2.queue.map((n) => n.type)).toEqual(['seal', 'haste', 'fog']);
    expect(r2.promotedEffects).toEqual(['haste']);
  });

  it('new arrivals never release the reserve early', () => {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'shield', ids, 10); // [1, 7], reserve 2
    hit(team, 'clear', ids); // creates third slot
    expect(team.reserve.shield?.energy).toBe(2);
    expect(team.queue).toHaveLength(3);
  });
});

describe('line-clear garbage cancellation', () => {
  it('cancels nearest first, keeps fully cancelled nodes in place', () => {
    const team = createTeam();
    team.queue = [makeNode('garbage', 1), makeNode('fog', 1), makeNode('garbage', 7)];
    expect(cancelGarbage(team, 2)).toBe(2);
    expect(netGarbage(team.queue[0]!)).toBe(0);
    expect(netGarbage(team.queue[2]!)).toBe(2);
    expect(team.queue).toHaveLength(3);
  });

  it('keeps cancelled lines when a node levels up', () => {
    const team = createTeam();
    const ids = makeIds();
    hit(team, 'haste', ids);
    hit(team, 'garbage', ids);
    cancelGarbage(team, 1);
    expect(netGarbage(team.queue[1]!)).toBe(0);
    hit(team, 'garbage', ids, 2); // energy 3 -> Lv.2
    expect(netGarbage(team.queue[1]!)).toBe(1);
  });
});
