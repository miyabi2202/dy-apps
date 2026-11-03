import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import { GameEngine } from '../core/game';
import { processGiftBatch, rarityBands } from '../core/gifts';
import { forceEffectRng } from './helpers';
import { createTeam, isConserved, pendingTotal } from '../core/interventions';
import { constantRng, mulberry32, sequenceRng } from '../core/random';
import type { GiftBatchResult } from '../core/types';

function checkBatchAccounting(r: GiftBatchResult) {
  expect(r.count).toBe(r.hits + r.misses);
  expect(Object.values(r.effects).reduce((a, b) => a + b, 0)).toBe(r.hits);
}

describe('drawing curses', () => {
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
    const w = CONFIG.gifts.rarityWeights;
    const total = w.common + w.uncommon + w.rare;
    const commonTo = w.common / total;
    const uncommonTo = (w.common + w.uncommon) / total;
    const bands = rarityBands(Object.values(CURSES));
    expect(bands.map((b) => [b.rarity, b.types])).toEqual([
      ['common', ['fog', 'seal', 'swap', 'hasty']],
      [
        'uncommon',
        ['haste', 'snakes', 'rockfall', 'slip', 'mirror', 'drunk', 'lag', 'fakeDeath', 'theft'],
      ],
      ['rare', ['garbage', 'noRotate', 'spin', 'twin', 'giant', 'possess']],
    ]);
    expect(bands[0]!.to).toBeCloseTo(commonTo);
    expect(bands[1]!.from).toBeCloseTo(commonTo);
    expect(bands[1]!.to).toBeCloseTo(uncommonTo);
    expect(bands[2]!.from).toBeCloseTo(uncommonTo);
    expect(bands[2]!.to).toBe(1);
    const draws: [number, number, string][] = [
      [0, 0, 'fog'],
      [commonTo - 0.01, 0.99, 'hasty'],
      [commonTo + 0.01, 0, 'haste'],
      [uncommonTo - 0.01, 0.5, 'mirror'],
      [uncommonTo - 0.01, 0.99, 'theft'],
      [uncommonTo + 0.01, 0, 'garbage'],
      [0.99, 0.99, 'possess'],
    ];
    for (const [rarity, index, expected] of draws) {
      const r = processGiftBatch(createTeam(), 'foo', 1, 1, sequenceRng([0, rarity, index]));
      expect(Object.keys(r.effects)).toEqual([expected]);
    }
  });

  it('never draws a unique curse while one is pending, even later in the same batch', () => {
    const team = createTeam();
    // Every diamond hits and aims at 假死; only the first can get it.
    const r = processGiftBatch(team, 'foo', 3, 1, forceEffectRng('fakeDeath'));
    expect(r.hits).toBe(3);
    expect(r.effects.fakeDeath).toBe(1);
    expect(team.pending.fakeDeath).toBe(1);
    expect(processGiftBatch(team, 'foo', 1, 1, forceEffectRng('fakeDeath')).effects.fakeDeath).toBe(
      undefined,
    );
    // Once it has fired (or been cancelled), it can be drawn again.
    team.pending.fakeDeath = 0;
    expect(processGiftBatch(team, 'foo', 1, 1, forceEffectRng('fakeDeath')).effects.fakeDeath).toBe(
      1,
    );
  });

  it('weights are scaled over the rarities in play', () => {
    const w = CONFIG.gifts.rarityWeights;
    const bands = rarityBands([CURSES.garbage, CURSES.fog]);
    expect(bands.map((b) => b.rarity)).toEqual(['common', 'rare']);
    expect(bands[0]!.to).toBeCloseTo(w.common / (w.common + w.rare));
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

  it('random batches always add up', () => {
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
    for (const bad of [0, -1, 1.5, CONFIG.gifts.maxBatch + 1, Number.NaN]) {
      const res = engine.sendGifts('foo', bad);
      expect(res.ok).toBe(false);
    }
    expect(engine.team.giftCount).toBe(0);
    expect(engine.sendGifts('foo', CONFIG.gifts.maxBatch).ok).toBe(true);
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
