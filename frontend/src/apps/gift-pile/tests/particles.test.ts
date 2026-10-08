import type { Gfx, ParticleData } from '../render/gfx';
import { Emitter, type Spawn } from '../removal/kit/particles';
import { StarPool } from '../removal/fireworks/star-pool';
import { mulberry32 } from './helpers';

/** A `Gfx` that keeps a copy of each particle or star draw, at the quality asked. */
function capture(quality: 'high' | 'low' = 'high') {
  const calls: { count: number; xy: number[]; alpha: number[] }[] = [];
  const gfx = {
    quality,
    particles(d: ParticleData) {
      calls.push({
        count: d.count,
        xy: [...d.xy.slice(0, 2 * d.count)],
        alpha: Array.from({ length: d.count }, (_, k) => d.rgba[4 * k + 3]!),
      });
    },
    shadeMany(_src: unknown, d: { count: number; xy: Float32Array }) {
      calls.push({ count: d.count, xy: [...d.xy.slice(0, 2 * d.count)], alpha: [] });
    },
  } as unknown as Gfx;
  return { gfx, calls };
}

const spawn = (over: Partial<Spawn> = {}): Spawn => ({ x: 0, y: 0, life: 1000, size: 10, ...over });

describe('Emitter', () => {
  const options = { colorFrom: '#ffffff' };

  it('drops spawns past its capacity, and a low quality draw lowers the cap to a share of it', () => {
    const e = new Emitter({ ...options, capacity: 10 }, mulberry32(1));
    e.burst(25, () => spawn());
    expect(e.alive).toBe(10);
    e.clear();
    e.draw(capture('low').gfx);
    e.burst(25, () => spawn());
    expect(e.alive).toBe(4);
    e.clear();
    e.draw(capture('high').gfx);
    e.burst(25, () => spawn());
    expect(e.alive).toBe(10);
  });

  it('lets those over a lowered cap live out their lives', () => {
    const e = new Emitter({ ...options, capacity: 10 }, mulberry32(1));
    e.burst(10, () => spawn({ life: 500 }));
    e.draw(capture('low').gfx);
    e.burst(5, () => spawn());
    expect(e.alive).toBe(10);
    e.step(499);
    expect(e.alive).toBe(10);
    e.step(2);
    expect(e.alive).toBe(0);
  });

  it('streams a rate over time, carrying the fractions over to the next call', () => {
    const e = new Emitter(options, mulberry32(1));
    let made = 0;
    const make = () => {
      made++;
      return spawn();
    };
    // 10 a second at 16 ms a frame is 0.16 a frame: the first is made on the seventh call.
    for (let k = 0; k < 6; k++) e.stream(10, 16, make);
    expect(made).toBe(0);
    e.stream(10, 16, make);
    expect(made).toBe(1);
    for (let k = 0; k < 100; k++) e.stream(10, 16, make);
    expect(made).toBe(Math.floor(107 * 0.16));
    // No time, none made; a long frame makes several.
    const before = made;
    e.stream(10, -50, make);
    expect(made).toBe(before);
    e.stream(100, 100, make);
    expect(made).toBeGreaterThanOrEqual(before + 10);
  });

  it('steps by gravity, then drag, then position', () => {
    const e = new Emitter({ ...options, gravity: 100, drag: 1 }, mulberry32(1));
    e.burst(1, () => spawn({ vx: 200, vy: 0, life: 5000 }));
    const { gfx, calls } = capture();
    e.step(1000);
    e.draw(gfx);
    // vy gains 100 over the second, then both lose e⁻¹ of their speed; the position moves by that.
    const keep = Math.exp(-1);
    expect(calls[0]!.xy[0]).toBeCloseTo(200 * keep, 3);
    expect(calls[0]!.xy[1]).toBeCloseTo(100 * keep, 3);
  });

  it('compacts the dead by swapping the last in, without skipping the one swapped', () => {
    const e = new Emitter(options, mulberry32(1));
    const lives = [100, 5000, 100, 5000, 100];
    e.burst(5, (k) => spawn({ x: k, life: lives[k]! }));
    e.step(200);
    expect(e.alive).toBe(2);
    const { gfx, calls } = capture();
    e.draw(gfx);
    expect(calls[0]!.xy.filter((_, i) => i % 2 === 0).sort()).toEqual([1, 3]);
  });

  it('is the same every time for the same random numbers, and draws nothing when empty', () => {
    const run = (seed: number) => {
      const e = new Emitter({ ...options, gravity: 50, twinkle: 0.5 }, mulberry32(seed));
      const make = mulberry32(99);
      const { gfx, calls } = capture();
      for (let f = 0; f < 20; f++) {
        e.stream(300, 16, () =>
          spawn({ x: make() * 100, vx: make() * 50, life: 200 + make() * 300 }),
        );
        e.step(16);
      }
      e.draw(gfx);
      return calls[0]!;
    };
    expect(run(7)).toEqual(run(7));
    // The twinkle's phase comes from the emitter's own rng.
    expect(run(7).alpha).not.toEqual(run(8).alpha);
    const { gfx, calls } = capture();
    new Emitter(options, mulberry32(1)).draw(gfx);
    expect(calls).toHaveLength(0);
  });
});

describe('StarPool', () => {
  const star = (over = {}) => ({ x: 0, y: 0, life: 1000, size: 10, color: '#ffffff', ...over });

  it('drops adds past its capacity', () => {
    const pool = new StarPool(5, mulberry32(1));
    for (let k = 0; k < 9; k++) pool.add(star());
    expect(pool.alive).toBe(5);
  });

  it('carries the fractions of a stream over, and lets go of the dead', () => {
    const pool = new StarPool(100, mulberry32(1));
    let made = 0;
    for (let k = 0; k < 10; k++) {
      pool.stream(25, 16, () => {
        made++;
        return star({ life: 100 });
      });
    }
    expect(made).toBe(4); // 25 a second over 160 ms
    pool.step(99);
    expect(pool.alive).toBe(4);
    pool.step(2);
    expect(pool.alive).toBe(0);
  });

  it('moves a star by its kind: a drip falls, glitter stays where it was', () => {
    const at = (mode: number) => {
      const pool = new StarPool(4, mulberry32(1));
      pool.add(star({ mode, x: 5, y: 7 }));
      pool.step(500);
      const { gfx, calls } = capture();
      pool.draw(gfx, 'stars');
      return calls[0]!.xy;
    };
    expect(at(2)).toEqual([5, 7]);
    // A drip (mode 1) is drawn by its streak, behind its head, which has fallen.
    const [, y] = at(1);
    expect(y).toBeGreaterThan(7);
  });

  it('draws only a share of its stars on low quality, the same ones every time', () => {
    const run = (quality: 'high' | 'low') => {
      const pool = new StarPool(100, mulberry32(3));
      for (let k = 0; k < 100; k++) pool.add(star({ x: k, vx: 10 }));
      const { gfx, calls } = capture(quality);
      pool.draw(gfx, 'stars');
      return calls[0]!;
    };
    expect(run('high').count).toBe(100);
    const low = run('low');
    expect(low.count).toBeGreaterThan(30);
    expect(low.count).toBeLessThan(60);
    expect(run('low')).toEqual(low);
  });
});
