import { CONFIG, EFFECT_POOL } from '../src/core/config';
import { GameEngine } from '../src/core/game';
import { processGiftBatch } from '../src/core/gifts';
import { createTeam, isConserved, pendingTotal } from '../src/core/interventions';
import { constantRng, mulberry32, sequenceRng } from '../src/core/random';
import type { GiftBatchResult } from '../src/core/types';

function checkBatchAccounting(r: GiftBatchResult) {
  expect(r.count).toBe(r.hits + r.misses);
  expect(Object.values(r.effects).reduce((a, b) => a + b, 0)).toBe(r.hits);
}

describe('example A: probability boundaries', () => {
  it('0% -> 100 misses, nothing pending', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'foo', 100, 0, mulberry32(1));
    expect(r.misses).toBe(100);
    expect(pendingTotal(team)).toBe(0);
    expect(team.missCount).toBe(100);
  });

  it('100% -> 100 hits with random effects', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'foo', 100, 1, mulberry32(1));
    expect(r.hits).toBe(100);
    expect(Object.keys(r.effects).length).toBeGreaterThan(1);
    checkBatchAccounting(r);
  });

  it('a trigger draw exactly equal to p misses', () => {
    const team = createTeam();
    const r = processGiftBatch(team, 'foo', 1, 0.6, constantRng(0.6));
    expect(r.misses).toBe(1);
    const r2 = processGiftBatch(team, 'foo', 1, 0.6, sequenceRng([0.5999, 0]));
    expect(r2.hits).toBe(1);
  });

  it('draws cover four equal quarters of the pool', () => {
    const draws: [number, string][] = [
      [0, EFFECT_POOL[0]!],
      [0.2499, EFFECT_POOL[0]!],
      [0.25, EFFECT_POOL[1]!],
      [0.5, EFFECT_POOL[2]!],
      [0.75, EFFECT_POOL[3]!],
      [0.9999, EFFECT_POOL[3]!],
    ];
    for (const [u, expected] of draws) {
      const r = processGiftBatch(createTeam(), 'foo', 1, 1, sequenceRng([0, u]));
      expect(Object.keys(r.effects)).toEqual([expected]);
    }
  });
});

describe('batches', () => {
  it('a batch of 100 equals 100 single gifts', () => {
    const batchTeam = createTeam();
    const singleTeam = createTeam();
    const batchRng = mulberry32(123);
    const singleRng = mulberry32(123);
    processGiftBatch(batchTeam, 'foo', 100, 0.6, batchRng);
    for (let i = 0; i < 100; i += 1) {
      processGiftBatch(singleTeam, 'foo', 1, 0.6, singleRng);
    }
    expect(singleTeam).toEqual(batchTeam);
  });

  it('example G: random batch accounting', () => {
    const team = createTeam();
    const rng = mulberry32(77);
    for (let i = 0; i < 30; i += 1) {
      const r = processGiftBatch(team, 'foo', 1 + i * 7, 0.6, rng);
      checkBatchAccounting(r);
      expect(isConserved(team)).toBe(true);
    }
  });

  it('records the sender on the result and in the history', () => {
    const engine = new GameEngine({ seed: 1 });
    engine.start();
    const res = engine.sendGifts('foo', 5);
    expect(res.ok && res.result.sender).toBe('foo');
    engine.sendGifts('bar', 3);
    expect(engine.giftHistory.map((e) => [e.sender, e.count])).toEqual([
      ['bar', 3],
      ['foo', 5],
    ]);
  });

  it('keeps a bounded gift history', () => {
    const engine = new GameEngine({ seed: 1 });
    engine.start();
    for (let i = 0; i < CONFIG.gifts.historySize + 5; i += 1) engine.sendGifts('foo', 1);
    expect(engine.giftHistory).toHaveLength(CONFIG.gifts.historySize);
  });

  it('rejects invalid counts without touching state', () => {
    const engine = new GameEngine({ seed: 1 });
    engine.start();
    for (const bad of [0, -1, 1.5, 10_001, Number.NaN]) {
      const res = engine.sendGifts('foo', bad);
      expect(res.ok).toBe(false);
    }
    expect(engine.team.giftCount).toBe(0);
    expect(engine.sendGifts('foo', 10_000).ok).toBe(true);
  });

  it('uses the probability at the start of the batch; later changes only affect later batches', () => {
    const engine = new GameEngine({ seed: 1, giftRng: constantRng(0.3) });
    engine.start();
    engine.setProbability(0.25);
    const first = engine.sendGifts('foo', 10);
    engine.setProbability(0.5);
    const second = engine.sendGifts('foo', 10);
    expect(first.ok && first.result.hits).toBe(0);
    expect(second.ok && second.result.hits).toBe(10);
  });

  it('gifts do not change the native piece sequence', () => {
    const a = new GameEngine({ seed: 5 });
    a.start();
    const b = new GameEngine({ seed: 5 });
    b.start();
    b.sendGifts('foo', 1000);
    expect(b.upcoming).toEqual(a.upcoming);
  });
});
