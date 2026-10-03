import { EFFECT_POOLS } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { processGiftBatch } from '../../src/core/gifts';
import { createTeam, isConserved } from '../../src/core/interventions';
import { constantRng, mulberry32, sequenceRng } from '../../src/core/random';
import type { GiftBatchResult } from '../../src/core/types';
import { makeIds } from '../helpers';

function checkBatchAccounting(r: GiftBatchResult) {
  expect(r.count).toBe(r.hits + r.misses);
  expect(r.hits).toBe(r.queuedEnergy + r.reservedEnergy + r.overflowEnergy);
  expect(Object.values(r.effects).reduce((a, b) => a + b, 0)).toBe(r.hits);
}

describe('example A: probability boundaries', () => {
  it('0% -> 100 misses, queue and reserve unchanged', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'bless', 100, 0, mulberry32(1), makeIds());
    expect(r.misses).toBe(100);
    expect(team.queue).toEqual([]);
    expect(team.reserve).toEqual({});
    expect(team.missCount).toBe(100);
  });

  it('100% -> 100 hits with random effects', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'curse', 100, 1, mulberry32(1), makeIds());
    expect(r.hits).toBe(100);
    expect(Object.keys(r.effects).length).toBeGreaterThan(1);
    checkBatchAccounting(r);
  });

  it('a trigger draw exactly equal to p misses', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'bless', 1, 0.6, constantRng(0.6), makeIds());
    expect(r.misses).toBe(1);
    const r2 = processGiftBatch(team, 'bless', 1, 0.6, sequenceRng([0.5999, 0]), makeIds());
    expect(r2.hits).toBe(1);
  });

  it.each(['bless', 'curse'] as const)(
    '%s draws cover four equal quarters of its own pool',
    (side) => {
      const draws: [number, string][] = [
        [0, EFFECT_POOLS[side][0]!],
        [0.2499, EFFECT_POOLS[side][0]!],
        [0.25, EFFECT_POOLS[side][1]!],
        [0.5, EFFECT_POOLS[side][2]!],
        [0.75, EFFECT_POOLS[side][3]!],
        [0.9999, EFFECT_POOLS[side][3]!],
      ];
      for (const [u, expected] of draws) {
        const r = processGiftBatch(createTeam(), side, 1, 1, sequenceRng([0, u]), makeIds());
        expect(Object.keys(r.effects)).toEqual([expected]);
      }
    },
  );
});

describe('batches', () => {
  it('a batch of 100 equals 100 single gifts', () => {
    const batchTeam = createTeam();
    const singleTeam = createTeam();
    const batchRng = mulberry32(123);
    const singleRng = mulberry32(123);
    const batchIds = makeIds();
    const singleIds = makeIds();
    processGiftBatch(batchTeam, 'curse', 100, 0.6, batchRng, batchIds);
    for (let i = 0; i < 100; i += 1) {
      processGiftBatch(singleTeam, 'curse', 1, 0.6, singleRng, singleIds);
    }
    expect(singleTeam).toEqual(batchTeam);
  });

  it('example G: random batch accounting', () => {
    const team = createTeam();
    const rng = mulberry32(77);
    for (let i = 0; i < 30; i += 1) {
      const r = processGiftBatch(team, i % 2 ? 'bless' : 'curse', 1 + i * 7, 0.6, rng, makeIds());
      checkBatchAccounting(r);
      expect(isConserved(team)).toBe(true);
    }
  });

  it('rejects invalid counts without touching state', () => {
    const engine = new GameEngine({ seed: 1 });
    for (const bad of [0, -1, 1.5, 10_001, Number.NaN]) {
      const res = engine.sendGifts('bless', bad);
      expect(res.ok).toBe(false);
    }
    expect(engine.teams.bless.giftCount).toBe(0);
    expect(engine.sendGifts('bless', 10_000).ok).toBe(true);
  });

  it('uses the probability at the start of the batch; later changes only affect later batches', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0.3) });
    engine.setProbability(0.25);
    const first = engine.sendGifts('bless', 10);
    engine.setProbability(0.5);
    const second = engine.sendGifts('bless', 10);
    expect(first.ok && first.result.hits).toBe(0);
    expect(second.ok && second.result.hits).toBe(10);
  });

  it('gifts do not change the native piece sequence', () => {
    const a = new GameEngine({ seed: 5 });
    const b = new GameEngine({ seed: 5 });
    b.sendGifts('bless', 500);
    b.sendGifts('curse', 500);
    expect(b.upcoming).toEqual(a.upcoming);
  });
});
