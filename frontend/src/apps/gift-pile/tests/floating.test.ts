/** @jest-environment node */
// Every way an icon has been left floating in the air, each as a test.
// Each test ends with the one invariant: no resting icon without a path to the floor.
import {
  createEngine,
  destroyAll,
  floating,
  movingIcons,
  neighbours,
  restingIcons,
  settle,
  step,
} from './engine-helpers';

describe('no icon floats', () => {
  it('removing an icon that something rests on wakes it, and the pile stays honest', async () => {
    const engine = await createEngine({}, 1);
    engine.add(300);
    settle(engine);
    const ids = restingIcons(engine);
    // The deepest icon with a resting icon touching it from above.
    const target = ids
      .filter((i) => neighbours(engine, i, ids).some((j) => engine.y[j]! < engine.y[i]!))
      .sort((a, b) => engine.y[b]! - engine.y[a]!)[0]!;
    const above = neighbours(engine, target, ids).filter((j) => engine.y[j]! < engine.y[target]!);

    destroyAll(engine, [target]);
    const woken: number[] = [];
    engine.drainWoken((i) => woken.push(i));
    expect(above.some((j) => woken.includes(j))).toBe(true);
    settle(engine);
    expect(floating(engine)).toEqual([]);
  });

  it.each([20, 45])(
    'removing icons %i steps into a second stream, movers included, leaves nothing hanging',
    async (wait) => {
      const engine = await createEngine({ world: { width: 300, height: 600 } }, 1);
      engine.add(1000);
      settle(engine);
      engine.add(500);
      step(engine, wait);
      const movers = movingIcons(engine);
      expect(movers.length).toBeGreaterThan(100);
      // Every mover goes, plus the random pick the user's button makes.
      destroyAll(engine, movers);
      engine.remove(300);
      settle(engine);
      expect(floating(engine)).toEqual([]);
    },
  );

  it('a column against a wall falls when what is under it goes', async () => {
    const engine = await createEngine({}, 1);
    const r = engine.radius;
    const m = engine.margin;
    const floor = engine.height - m - r;
    engine.add(5);
    settle(engine);
    // Stack them up the left wall, one at a time, through the public API.
    const column = restingIcons(engine);
    column.forEach((i, k) => {
      engine.grab(i);
      engine.release(i, m + r, floor - k * 2 * r - 1);
      settle(engine);
    });
    for (const i of column) expect(engine.x[i]).toBeCloseTo(m + r, 0);

    const [bottom, ...rest] = column;
    const before = rest.map((i) => engine.y[i]!);
    destroyAll(engine, [bottom!]);
    settle(engine);
    expect(floating(engine)).toEqual([]);
    rest.forEach((i, k) => expect(engine.y[i]).toBeGreaterThan(before[k]! + r));
  });

  it('a narrow world survives repeated random removal', async () => {
    const engine = await createEngine({ world: { width: 150, height: 300 } }, 2);
    engine.add(500);
    settle(engine);
    while (engine.alive > 0) {
      engine.remove(100);
      step(engine, 30);
      settle(engine);
      expect(floating(engine)).toEqual([]);
    }
  });

  it('taking the bottom two rows away in one go drops everything above them', async () => {
    const engine = await createEngine({}, 1);
    const r = engine.radius;
    const floor = engine.height - engine.margin - r;
    engine.add(400);
    settle(engine);
    const bottom = restingIcons(engine).filter((i) => engine.y[i]! > floor - 4 * r - 1);
    destroyAll(engine, bottom);
    // Direct dependents wake at once; the rest hold each other up until the sweep.
    step(engine, 8);
    expect(restingIcons(engine)).toEqual([]);
    settle(engine);
    expect(floating(engine)).toEqual([]);
    expect(engine.alive).toBe(400 - bottom.length);
  });

  it.each([1, 2])(
    'repeated bulk removal keeps the pile honest to the pixel (seed %i)',
    async (seed) => {
      const engine = await createEngine({}, seed);
      engine.add(800);
      settle(engine);
      while (engine.alive > 0) {
        engine.remove(150);
        step(engine, 60);
        settle(engine);
        // A 1 px tolerance in `floating` is what catches drift adding up across wakes.
        expect(floating(engine)).toEqual([]);
      }
    },
  );

  it('a big pour comes to rest, with no straggler held by a single neighbour', async () => {
    const engine = await createEngine({ world: { width: 300, height: 600 } }, 2);
    engine.add(3000);
    settle(engine, 30);
    expect(engine.movingCount).toBe(0);
    expect(floating(engine)).toEqual([]);
  });
});
