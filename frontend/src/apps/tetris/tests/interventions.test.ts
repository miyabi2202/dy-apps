import { CURSES, EFFECT_POOL, type EffectType } from '../core/curses';
import {
  addHit,
  addSystemCurse,
  cancelOne,
  createTeam,
  isConserved,
  pendingTotal,
  settleTeam,
} from '../core/interventions';
import type { TeamState } from '../core/types';
import { pendingOf } from './helpers';

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
    expect(team.pending).toEqual(pendingOf({ garbage: 1000, fog: 2 }));
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
    expect(team.pending).toEqual(pendingOf({ garbage: 3, haste: 1 }));
    expect(settleTeam(team)).toEqual(['garbage', 'haste']);
    expect(team.firedCount).toBe(5);
    expect(isConserved(team)).toBe(true);
  });

  it('a shared queue takes turns, so neither type starves the other', () => {
    const team = createTeam();
    hit(team, 'noRotate', 5);
    hit(team, 'spin', 2);
    const pool = ['noRotate', 'spin'] as const;
    const shared = () => 'e';
    expect(settleTeam(team, pool, shared)).toEqual(['noRotate']);
    expect(settleTeam(team, pool, shared)).toEqual(['spin']);
    expect(settleTeam(team, pool, shared)).toEqual(['noRotate']);
    expect(settleTeam(team, pool, shared)).toEqual(['spin']);
    expect(settleTeam(team, pool, shared)).toEqual(['noRotate']);
    expect(team.pending).toMatchObject({ noRotate: 2, spin: 0 });
    expect(isConserved(team)).toBe(true);
  });

  it('an empty queue fires nothing', () => {
    const team = createTeam();
    expect(settleTeam(team)).toEqual([]);
    expect(team.firedCount).toBe(0);
  });
});

describe('cancelling and quiet-room curses', () => {
  const rarityOf = (type: EffectType) => CURSES[type].rarity;

  it('cancels the rarest pending curse first, then in pool order', () => {
    const team = createTeam();
    hit(team, 'fog', 2);
    hit(team, 'haste', 1);
    hit(team, 'spin', 1);
    hit(team, 'garbage', 1);
    expect(cancelOne(team, EFFECT_POOL, rarityOf)).toBe('garbage');
    expect(cancelOne(team, EFFECT_POOL, rarityOf)).toBe('spin');
    expect(cancelOne(team, EFFECT_POOL, rarityOf)).toBe('haste');
    expect(cancelOne(team, EFFECT_POOL, rarityOf)).toBe('fog');
    expect(team.pending).toEqual(pendingOf({ fog: 1 }));
    expect(team.cancelledCount).toBe(4);
    expect(isConserved(team)).toBe(true);
  });

  it('cancels nothing when nothing is pending', () => {
    const team = createTeam();
    expect(cancelOne(team, EFFECT_POOL, rarityOf)).toBeNull();
    expect(team.cancelledCount).toBe(0);
  });

  it('a curse the game draws is pending without a gift, and still conserved', () => {
    const team = createTeam();
    addSystemCurse(team, 'seal');
    expect(team.pending).toEqual(pendingOf({ seal: 1 }));
    expect(team.systemCount).toBe(1);
    settleTeam(team);
    expect(isConserved(team)).toBe(true);
  });
});
