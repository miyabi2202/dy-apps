import { CONFIG } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { isConserved } from '../../src/core/interventions';
import { mulberry32 } from '../../src/core/random';
import { dropOnEmpty } from '../helpers';

function assertBounded(engine: GameEngine) {
  const { team } = engine;
  expect(isConserved(team)).toBe(true);
  for (const n of Object.values(team.pending)) expect(n).toBeGreaterThanOrEqual(0);
  expect(engine.giftHistory.length).toBeLessThanOrEqual(CONFIG.gifts.historySize);
  expect(engine.log.length).toBeLessThanOrEqual(CONFIG.log.maxEntries);
  expect(engine.upcoming.length).toBeLessThanOrEqual(CONFIG.sequence.minBuffer);
}

describe('stress', () => {
  it('30,000+ mixed gifts with varying settlement gaps stay bounded and conserved', () => {
    const engine = new GameEngine({ seed: 2024 });
    engine.start();
    const driver = mulberry32(99);
    let sent = 0;
    const started = performance.now();
    while (sent < 30_000) {
      const count = 1 + Math.floor(driver.next() * 1500);
      const res = engine.sendGifts('foo', count);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const r = res.result;
        expect(r.hits + r.misses).toBe(count);
        expect(Object.values(r.effects).reduce((a, b) => a + b, 0)).toBe(r.hits);
      }
      sent += count;
      // 0–5 locks between batches, so settlements land at irregular points.
      dropOnEmpty(engine, Math.floor(driver.next() * 6));
      expect(engine.phase).toBe('playing');
      assertBounded(engine);
    }
    const elapsed = performance.now() - started;

    expect(engine.team.giftCount).toBe(sent);
    expect(engine.settlementCount).toBeGreaterThan(0);

    // Still playable afterwards.
    expect(engine.move(-1) || engine.move(1)).toBe(true);
    expect(engine.rotate(1)).toBe(true);
    const locks = engine.lockedPieceCount;
    dropOnEmpty(engine, 3);
    expect(engine.lockedPieceCount).toBe(locks + 3);
    assertBounded(engine);

    // Recorded in the README as a rough local measurement.
    console.info(
      `stress: ${sent} gifts, ${engine.settlementCount} settlements in ${elapsed.toFixed(0)} ms`,
    );
  });

  it('10,000 gifts in one batch is processed in one call with O(1) retained state', () => {
    const engine = new GameEngine({ seed: 3 });
    const res = engine.sendGifts('foo', 10_000);
    expect(res.ok).toBe(true);
    const { team } = engine;
    expect(Object.keys(team.pending)).toHaveLength(4);
    expect(engine.giftHistory).toHaveLength(1);
    expect(isConserved(team)).toBe(true);
    expect(engine.log.length).toBeLessThanOrEqual(CONFIG.log.maxEntries);
  });
});
