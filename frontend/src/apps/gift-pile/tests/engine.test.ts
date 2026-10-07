/** @jest-environment node */
import { PILE } from '../core/config';
import type { PileEngine } from '../core/engine';
import { createEngine, neighbours, restingIcons, settle } from './engine-helpers';

const r = PILE.collisionRadius;
const m = PILE.margin;

/** The resting icons touching `i` from above. */
const restingOn = (engine: PileEngine, i: number) =>
  neighbours(engine, i).filter((j) => engine.y[j]! < engine.y[i]!);

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

  it('destroying a held icon and removing take exactly what was asked', async () => {
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

  it('scooping holds icons for the page to fly off, until each is released or destroyed', async () => {
    const engine = await createEngine();
    engine.add(60);
    settle(engine);
    const before = restingIcons(engine);

    const top = Math.min(...before.map((i) => engine.y[i]!));
    const floor = engine.height - m - r;

    const ids = engine.scoop(5);
    expect(ids).toHaveLength(5);
    // From the top of the pile, and still counted while held.
    for (const i of ids) {
      expect(engine.y[i]).toBeLessThan((top + floor) / 2);
      expect(engine.held[i]).toBe(1);
      expect(engine.dead[i]).toBe(0);
      expect(engine.resting[i]).toBe(0);
    }
    expect(engine.alive).toBe(60);
    expect(restingIcons(engine)).toHaveLength(before.length - 5);
    // A second scoop can't take what the first holds.
    const again = engine.scoop(5);
    expect(again.some((i) => ids.includes(i))).toBe(false);

    // One falls back into the pile; the rest are gone.
    engine.release(ids[0]!, 100, 40);
    for (const i of ids.slice(1)) engine.destroy(i);
    for (const i of again) engine.destroy(i);
    expect(engine.alive).toBe(51);
    settle(engine);
    expect(engine.resting[ids[0]!]).toBe(1);
    expect(engine.movingCount).toBe(0);
  });

  it('removes from the top of the pile down, loosely', async () => {
    const engine = await createEngine();
    engine.add(120);
    settle(engine);
    const before = restingIcons(engine);
    const top = Math.min(...before.map((i) => engine.y[i]!));
    const floor = engine.height - m - r;

    expect(engine.remove(20)).toBe(20);
    const gone = before.filter((i) => engine.dead[i]);
    const kept = before.filter((i) => !engine.dead[i]);
    const mean = (ids: number[]) => ids.reduce((sum, i) => sum + engine.y[i]!, 0) / ids.length;
    expect(gone).toHaveLength(20);
    // Everything that went came from the upper half of the pile, and nothing from the floor.
    for (const i of gone) {
      expect(engine.y[i]).toBeLessThan((top + floor) / 2);
      expect(engine.y[i]).toBeLessThan(floor - 2 * r);
    }
    expect(mean(gone)).toBeLessThan(mean(kept));
    // Loosely: the very highest icons don't all go, so the top isn't shaved off in a line.
    const highest = [...before].sort((a, b) => engine.y[a]! - engine.y[b]!).slice(0, 20);
    expect(highest.some((i) => !engine.dead[i])).toBe(true);
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
