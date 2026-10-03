import { CONFIG } from '../../src/core/config';
import { GameEngine } from '../../src/core/game';
import { isConserved, queueEnergy, reserveTotal } from '../../src/core/interventions';
import { mulberry32 } from '../../src/core/random';
import type { Side } from '../../src/core/types';
import { dropOnEmpty } from '../helpers';

function assertBounded(engine: GameEngine) {
  for (const side of ['bless', 'curse'] as const) {
    const team = engine.teams[side];
    expect(isConserved(team)).toBe(true);
    expect(team.queue.length).toBeLessThanOrEqual(CONFIG.queue.capacity);
    expect(Object.keys(team.reserve).length).toBeLessThanOrEqual(4);
    expect(reserveTotal(team)).toBeLessThanOrEqual(CONFIG.queue.reserveCapacity);
    for (const node of team.queue) {
      expect(node.energy).toBeGreaterThanOrEqual(1);
      expect(node.energy).toBeLessThanOrEqual(CONFIG.queue.nodeMaxEnergy);
    }
    const unlocked = team.queue.slice(1).map((n) => n.type);
    expect(new Set(unlocked).size).toBe(unlocked.length);
  }
  expect(engine.log.length).toBeLessThanOrEqual(CONFIG.log.maxEntries);
  expect(engine.upcoming.length).toBeLessThanOrEqual(CONFIG.sequence.minBuffer);
  expect(engine.effects.shield).toBeLessThanOrEqual(CONFIG.effects.shieldMax);
  expect(engine.effects.longCredits).toBeLessThanOrEqual(CONFIG.effects.longMaxCredits);
}

describe('stress', () => {
  it('30,000+ mixed gifts with varying settlement gaps stay bounded and conserved', () => {
    const engine = new GameEngine({ seed: 2024 });
    engine.start();
    const driver = mulberry32(99);
    let sent = 0;
    const started = performance.now();
    while (sent < 30_000) {
      const side: Side = driver.next() < 0.5 ? 'bless' : 'curse';
      const count = 1 + Math.floor(driver.next() * 1500);
      const res = engine.sendGifts(side, count);
      expect(res.ok).toBe(true);
      if (res.ok) {
        const r = res.result;
        expect(r.hits).toBe(r.queuedEnergy + r.reservedEnergy + r.overflowEnergy);
      }
      sent += count;
      // 0–5 locks between batches, so settlements land at irregular points.
      dropOnEmpty(engine, Math.floor(driver.next() * 6));
      expect(engine.phase).toBe('playing');
      assertBounded(engine);
    }
    const elapsed = performance.now() - started;

    const totalGifts = engine.teams.bless.giftCount + engine.teams.curse.giftCount;
    expect(totalGifts).toBe(sent);
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
    const res = engine.sendGifts('curse', 10_000);
    expect(res.ok).toBe(true);
    const team = engine.teams.curse;
    expect(queueEnergy(team) + reserveTotal(team)).toBeLessThanOrEqual(
      CONFIG.queue.capacity * CONFIG.queue.nodeMaxEnergy + CONFIG.queue.reserveCapacity,
    );
    expect(isConserved(team)).toBe(true);
    expect(engine.log.length).toBeLessThanOrEqual(CONFIG.log.maxEntries);
  });
});
