import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import { GameEngine } from '../core/game';
import { processGiftBatch, rarityBands } from '../core/gifts';
import { createTeam, isConserved, pendingTotal } from '../core/interventions';
import { constantRng, mulberry32, sequenceRng } from '../core/random';
import type { GiftBatchResult } from '../core/types';

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
    const r2 = processGiftBatch(team, 'foo', 1, 0.6, sequenceRng([0.5999, 0, 0]));
    expect(r2.hits).toBe(1);
  });

  it('a hit draws a rarity by weight, then one of its curses evenly', () => {
    // Registry: fog, seal and noRotate common; haste and spin uncommon; garbage rare.
    const bands = rarityBands(Object.values(CURSES));
    expect(bands.map((b) => [b.rarity, b.types])).toEqual([
      ['common', ['fog', 'seal']],
      ['uncommon', ['haste']],
      ['rare', ['garbage', 'noRotate', 'spin']],
    ]);
    expect(bands.map((b) => b.to)).toEqual([expect.any(Number), expect.any(Number), 1]);
    expect(bands[0]!.to).toBeCloseTo(0.6);
    expect(bands[1]!.from).toBeCloseTo(0.6);
    expect(bands[1]!.to).toBeCloseTo(0.9);
    expect(bands[2]!.from).toBeCloseTo(0.9);
    const draws: [number, number, string][] = [
      [0, 0, 'fog'],
      [0.59, 0.5, 'seal'],
      [0.61, 0.99, 'haste'],
      [0.89, 0, 'haste'],
      [0.91, 0, 'garbage'],
      [0.95, 0.34, 'noRotate'],
      [0.99, 0.99, 'spin'],
    ];
    for (const [rarity, index, expected] of draws) {
      const r = processGiftBatch(createTeam(), 'foo', 1, 1, sequenceRng([0, rarity, index]));
      expect(Object.keys(r.effects)).toEqual([expected]);
    }
  });

  it('weights are scaled over the rarities in play', () => {
    const bands = rarityBands([CURSES.garbage, CURSES.fog]);
    expect(bands.map((b) => b.rarity)).toEqual(['common', 'rare']);
    expect(bands[0]!.to).toBeCloseTo(0.6 / 0.7);
    expect(bands[1]!.to).toBe(1);
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
