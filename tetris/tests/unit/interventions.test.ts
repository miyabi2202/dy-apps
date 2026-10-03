import {
  addHit,
  cancelGarbage,
  createTeam,
  isConserved,
  pendingTotal,
  settleTeam,
} from '../../src/core/interventions';
import type { EffectType, TeamState } from '../../src/core/types';

function hit(team: TeamState, type: EffectType, times = 1) {
  for (let i = 0; i < times; i += 1) {
    team.giftCount += 1;
    team.hitCount += 1;
    addHit(team, type);
  }
}

describe('pending counts', () => {
  it('each triggered curse adds one to its own count, with no cap', () => {
    const team = createTeam();
    hit(team, 'garbage', 1000);
    hit(team, 'fog', 2);
    expect(team.pending).toEqual({ garbage: 1000, haste: 0, fog: 2, seal: 0 });
    expect(pendingTotal(team)).toBe(1002);
    expect(isConserved(team)).toBe(true);
  });
});

describe('settlement', () => {
  it('fires each pending type once and leaves the rest waiting', () => {
    const team = createTeam();
    hit(team, 'garbage', 4);
    hit(team, 'haste', 2);
    hit(team, 'seal', 1);
    expect(settleTeam(team)).toEqual(['garbage', 'haste', 'seal']);
    expect(team.pending).toEqual({ garbage: 3, haste: 1, fog: 0, seal: 0 });
    expect(settleTeam(team)).toEqual(['garbage', 'haste']);
    expect(team.firedCount).toBe(5);
    expect(isConserved(team)).toBe(true);
  });

  it('an empty queue fires nothing', () => {
    const team = createTeam();
    expect(settleTeam(team)).toEqual([]);
    expect(team.firedCount).toBe(0);
  });
});

describe('line-clear garbage cancellation', () => {
  it('cancels up to N pending garbage and nothing else', () => {
    const team = createTeam();
    hit(team, 'garbage', 3);
    hit(team, 'fog', 1);
    expect(cancelGarbage(team, 2)).toBe(2);
    expect(team.pending).toEqual({ garbage: 1, haste: 0, fog: 1, seal: 0 });
    expect(cancelGarbage(team, 4)).toBe(1);
    expect(team.pending.garbage).toBe(0);
    expect(team.canceledCount).toBe(3);
    expect(isConserved(team)).toBe(true);
  });
});
