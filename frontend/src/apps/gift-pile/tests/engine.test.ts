/** @jest-environment node */
import { PILE } from '../core/config';
import type { PileEngine } from '../core/engine';
import { createEngine, settle } from './engine-helpers';

const r = PILE.collisionRadius;
const m = PILE.margin;

/** Every icon that is at rest, by index. */
const restingIcons = (engine: PileEngine) =>
  Array.from({ length: engine.count }, (_, i) => i).filter((i) => engine.resting[i]);

/** The resting icons touching `i` from above. */
const restingOn = (engine: PileEngine, i: number) =>
  restingIcons(engine).filter((j) => {
    const dx = engine.x[j]! - engine.x[i]!;
    const dy = engine.y[j]! - engine.y[i]!;
    return j !== i && dy < 0 && Math.hypot(dx, dy) <= 2 * r + 1;
  });

describe('PileEngine', () => {
  it('drops the icons asked for, and they all come to rest inside the walls and above the floor', async () => {
    const engine = await createEngine();
    expect(engine.add(120)).toBe(120);
    settle(engine);

    expect(engine.queued).toBe(0);
    expect(engine.movingCount).toBe(0);
    expect(engine.alive).toBe(120);
    expect(restingIcons(engine)).toHaveLength(120);

    const floor = engine.height - m - r;
    let onFloor = 0;
    for (const i of restingIcons(engine)) {
      expect(engine.x[i]).toBeGreaterThanOrEqual(m + r);
      expect(engine.x[i]).toBeLessThanOrEqual(engine.width - m - r);
      expect(engine.y[i]).toBeLessThanOrEqual(floor + 0.01);
      if (engine.y[i]! > floor - 0.5) onFloor++;
    }
    expect(onFloor).toBeGreaterThan(5);
  });

  it('keeps resting icons from sinking far into each other', async () => {
    const engine = await createEngine();
    engine.add(120);
    settle(engine);
    const icons = restingIcons(engine);
    let closest = Infinity;
    for (const i of icons) {
      for (const j of icons) {
        if (j <= i) continue;
        closest = Math.min(
          closest,
          Math.hypot(engine.x[i]! - engine.x[j]!, engine.y[i]! - engine.y[j]!),
        );
      }
    }
    // Soft contacts leave a little overlap under load; most of a radius would be a bug.
    expect(closest).toBeGreaterThan(2 * r - r / 2);
  });

  it('grabbing a resting icon wakes what rested on it, and releasing it lets it settle again', async () => {
    const engine = await createEngine();
    engine.add(120);
    settle(engine);

    // A buried icon: one with others resting on it.
    const target = restingIcons(engine)
      .filter((i) => restingOn(engine, i).length > 0)
      .sort((a, b) => engine.y[b]! - engine.y[a]!)[0]!;
    const above = restingOn(engine, target);
    const alive = engine.alive;

    engine.grab(target);
    const woken: number[] = [];
    engine.drainWoken((i) => woken.push(i));
    expect(engine.held[target]).toBe(1);
    expect(engine.resting[target]).toBe(0);
    expect(woken).toContain(target);
    for (const j of above) {
      expect(woken).toContain(j);
      expect(engine.resting[j]).toBe(0);
    }
    expect(engine.movingCount).toBeGreaterThanOrEqual(above.length);
    expect(engine.alive).toBe(alive);

    settle(engine);
    expect(engine.movingCount).toBe(0);
    expect(engine.held[target]).toBe(1);

    engine.release(target, 100, 40);
    expect(engine.held[target]).toBe(0);
    expect(engine.movingCount).toBe(1);
    settle(engine);
    expect(engine.resting[target]).toBe(1);
    expect(engine.alive).toBe(alive);
  });

  it('destroying a held icon and removing at random take exactly what was asked', async () => {
    const engine = await createEngine();
    engine.add(60);
    settle(engine);

    const target = restingIcons(engine)[0]!;
    engine.grab(target);
    engine.destroy(target);
    expect(engine.dead[target]).toBe(1);
    expect(engine.held[target]).toBe(0);
    expect(engine.alive).toBe(59);
    // Only a held icon can be destroyed.
    engine.destroy(restingIcons(engine)[0]!);
    expect(engine.alive).toBe(59);

    expect(engine.remove(7)).toBe(7);
    expect(engine.alive).toBe(52);
    settle(engine);
    expect(engine.movingCount).toBe(0);

    // Down to the last few, every click still takes what it can.
    expect(engine.remove(50)).toBe(50);
    expect(engine.remove(5)).toBe(2);
    expect(engine.remove(5)).toBe(0);
    expect(engine.alive).toBe(0);
    settle(engine);
    expect(engine.movingCount).toBe(0);
  });

  it('resizing makes an empty world of the play area plus the margin', async () => {
    const engine = await createEngine();
    engine.add(30);
    settle(engine);
    const generation = engine.generation;

    engine.resize(100, 150);
    expect(engine.width).toBe(100 + 2 * m);
    expect(engine.height).toBe(150 + m);
    expect(engine.count).toBe(0);
    expect(engine.alive).toBe(0);
    expect(engine.generation).toBe(generation + 1);

    engine.add(20);
    settle(engine);
    for (const i of restingIcons(engine)) {
      expect(engine.x[i]).toBeGreaterThanOrEqual(m + r);
      expect(engine.x[i]).toBeLessThanOrEqual(100 + m - r);
      expect(engine.y[i]).toBeLessThanOrEqual(150 - r + 0.01);
    }
  });
});
