/** @jest-environment node */
import { PILE } from '../core/config';
import type { PileEngine } from '../core/engine';
import { createEngine, neighbours, restingIcons, settle, step } from './engine-helpers';

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

  it('scooping sets icons aside for the page to grab, leaving the pile as it is until then', async () => {
    const engine = await createEngine();
    engine.add(60);
    settle(engine);
    const before = restingIcons(engine);
    const top = Math.min(...before.map((i) => engine.y[i]!));
    const floor = engine.height - m - r;

    const ids = engine.scoop(5);
    expect(ids).toHaveLength(5);
    // From the top of the pile, and still resting where they were.
    for (const i of ids) {
      expect(engine.y[i]).toBeLessThan((top + floor) / 2);
      expect(engine.reserved[i]).toBe(1);
      expect(engine.held[i]).toBe(0);
      expect(engine.resting[i]).toBe(1);
    }
    expect(engine.alive).toBe(60);
    expect(restingIcons(engine)).toHaveLength(60);
    settle(engine);
    expect(engine.movingCount).toBe(0);
    // A second scoop can't take what the first has set aside.
    const again = engine.scoop(5);
    expect(again.some((i) => ids.includes(i))).toBe(false);

    // The page takes them one by one; one falls back into the pile, the rest are gone.
    for (const i of [...ids, ...again]) engine.grab(i);
    expect(engine.alive).toBe(60);
    engine.release(ids[0]!, 100, 40);
    expect(engine.reserved[ids[0]!]).toBe(0);
    for (const i of ids.slice(1)) engine.destroy(i);
    for (const i of again) engine.destroy(i);
    expect(engine.alive).toBe(51);
    settle(engine);
    expect(engine.resting[ids[0]!]).toBe(1);
    expect(engine.movingCount).toBe(0);
    // Released, it can be scooped again.
    expect(engine.scoop(60)).toContain(ids[0]);
  });

  it('scoops a clump off the top of the pile near a point across it, when asked', async () => {
    const engine = await createEngine({ world: { width: 400, height: 300 } });
    engine.add(240);
    settle(engine);
    const resting = restingIcons(engine);
    const x = 0.25 * engine.width;
    const ids = engine.scoop(12, { kind: 'clump', at: 0.25 });
    expect(ids).toHaveLength(12);
    // All from around there, and from the top: none lower than the pile's middle.
    const middle = resting.map((i) => engine.y[i]!).sort((a, b) => a - b)[resting.length / 2]!;
    for (const i of ids) {
      expect(Math.abs(engine.x[i]! - x)).toBeLessThan(8 * r);
      expect(engine.y[i]).toBeLessThan(middle);
    }
  });

  it('scoops the outer layer all across the pile, rather than just its peak, when asked', async () => {
    const engine = await createEngine({ world: { width: 400, height: 300 } });
    engine.add(300);
    settle(engine);
    const n = 30;
    const spread = (ids: number[]) => {
      const xs = ids.map((i) => engine.x[i]!);
      return Math.max(...xs) - Math.min(...xs);
    };
    const layer = engine.scoop(n, { kind: 'layers' });
    const restingNow = restingIcons(engine).filter((i) => !layer.includes(i));
    // From one side of the pile to the other, and none with an icon left above it.
    expect(spread(layer)).toBeGreaterThan(0.6 * engine.width);
    for (const i of layer) {
      const above = restingNow.filter(
        (j) => Math.abs(engine.x[j]! - engine.x[i]!) < r && engine.y[j]! < engine.y[i]! - r,
      );
      expect(above).toHaveLength(0);
    }
  });

  it('lets a held icon go moving, when given a speed', async () => {
    const engine = await createEngine();
    engine.add(2);
    settle(engine);
    engine.grab(0);
    engine.grab(1);
    // Side by side, one still and one thrown up and to the right.
    engine.release(0, 40, 60);
    engine.release(1, 60, 60, 300, -200);
    step(engine, 6);
    expect(engine.x[0]).toBeCloseTo(40, 0);
    expect(engine.x[1]).toBeGreaterThan(60 + 20);
    expect(engine.y[1]).toBeLessThan(engine.y[0]! - 10);
  });

  it('releases new icons at the drop line the page sets, held to just above the canvas, until a clear', async () => {
    const engine = await createEngine();
    // Read after a step, so within a step's fall (and the band they are spread over) of the line.
    const fall = PILE.spawnSpeed / PILE.stepHz;
    const releasedAt = (line: number | null) => {
      if (line !== null) engine.setDropLine(line);
      const i = engine.count;
      engine.add(1);
      step(engine, 1);
      return engine.y[i]!;
    };
    const near = (y: number, line: number) =>
      expect(Math.abs(y - line)).toBeLessThanOrEqual(2 * fall);
    // Not told yet: just above the canvas's top.
    near(releasedAt(null), -r);
    // Up where the view has gone to keep clear of a tall pile.
    near(releasedAt(-500), -500);
    // A line down on the canvas would drop them in view: they still come in above it.
    near(releasedAt(200), -r);
    // A clear starts the pile over, and the line with it.
    engine.setDropLine(-500);
    engine.clear();
    near(releasedAt(null), -r);
  });

  it('follows the pile back down after a removal, rather than releasing from where its top was', async () => {
    const engine = await createEngine();
    const fall = PILE.spawnSpeed / PILE.stepHz;
    // A pile grown far above the canvas's top.
    engine.add(900);
    settle(engine);
    const tall = Math.min(...restingIcons(engine).map((i) => engine.y[i]!));
    expect(tall).toBeLessThan(-200);
    // Most of it goes, and the page has the line just above the canvas again.
    engine.remove(800);
    settle(engine);
    engine.setDropLine(-r);
    const first = engine.count;
    engine.add(1);
    step(engine, 1);
    // From just above the canvas, where the line says, not from above where the top used to be.
    expect(Math.abs(engine.y[first]! - -r)).toBeLessThanOrEqual(2 * fall);
  });

  it('never releases inside the heap, even when the drop line has gone stale as the pile grew past it', async () => {
    const engine = await createEngine();
    // The page said where once and then stopped (a hidden tab): the pile grows past the line.
    engine.setDropLine(-r);
    engine.add(800);
    // Not `settle`, which keeps the line up as the page does.
    for (let n = 0; n < 30 * PILE.stepHz && (engine.queued > 0 || engine.movingCount > 0); n++) {
      engine.step();
    }
    expect(engine.queued).toBe(0);
    const top = Math.min(...restingIcons(engine).map((i) => engine.y[i]!));
    expect(top).toBeLessThan(-100);
    const first = engine.count;
    engine.add(1);
    step(engine, 1);
    // Within a step's fall of the line, a diameter above the heap.
    expect(engine.y[first]).toBeLessThan(top);
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
