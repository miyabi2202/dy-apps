/** @jest-environment node */
import type { Scoop } from '../core/protocol';
import {
  planRemoval,
  VACUUM_CAPACITY,
  VacuumFlights,
  type FlightSink,
} from '../render/vacuum-flight';
import { mulberry32 } from './helpers';

/** Remembers what the flights ask of the engine. */
class FakeSink implements FlightSink {
  scoops: { count: number; extra: number }[] = [];
  removed: number[] = [];
  grabbed: number[] = [];
  released: { id: number; x: number; y: number }[] = [];
  destroyed: number[] = [];
  scoop(count: number, extra: number) {
    this.scoops.push({ count, extra });
  }
  remove(count: number) {
    this.removed.push(count);
  }
  grab(id: number) {
    this.grabbed.push(id);
  }
  release(id: number, x: number, y: number) {
    this.released.push({ id, x, y });
  }
  destroy(id: number) {
    this.destroyed.push(id);
  }
}

/** A 2D context where every call is a no-op and every property can be set; gradients take stops. */
const fakeContext = () =>
  new Proxy({} as CanvasRenderingContext2D, {
    get: (_, key) =>
      key === 'createLinearGradient' || key === 'createRadialGradient'
        ? () => ({ addColorStop() {} })
        : () => undefined,
    set: () => true,
  });

const world = { width: 416, height: 708 };
const noStamp = () => {};
/** The renderer knows where every icon is: in a row along the top of a pile. */
const take = (id: number) => ({ x: 20 + (id - 100) * 12, y: 500 });

/** `n` icons in a row along the top of a pile, with `drop` of them to come back. */
const scoopOf = (n: number, drop: number, from = 100): Scoop => ({
  ids: Int32Array.from({ length: n }, (_, k) => from + k),
  xy: Float32Array.from({ length: 2 * n }, (_, i) =>
    i % 2 === 0 ? 20 + ((from - 100 + i / 2) % 33) * 12 : 500,
  ),
  drop,
});

describe('planRemoval', () => {
  it('flies what one plane can carry, with a few extra to drop, and removes the rest at once', () => {
    expect(planRemoval(1)).toEqual({ fly: 1, extra: 1, instant: 0 });
    expect(planRemoval(50)).toEqual({ fly: 50, extra: 6, instant: 0 });
    expect(planRemoval(1000)).toEqual({ fly: 1000, extra: 12, instant: 0 });
    expect(planRemoval(VACUUM_CAPACITY + 500)).toEqual({
      fly: VACUUM_CAPACITY,
      extra: 12,
      instant: 500,
    });
  });
});

describe('VacuumFlights', () => {
  it('asks for a scoop at once, and removes anything over a plane load on the spot', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink);
    flights.remove(30, 0);
    expect(sink.scoops).toEqual([{ count: 34, extra: 4 }]);
    expect(sink.removed).toEqual([]);
    flights.remove(VACUUM_CAPACITY + 10, 0);
    expect(sink.removed).toEqual([10]);
    // The second plane waits for the first scoop to come back and the first plane to go.
    expect(sink.scoops).toHaveLength(1);
    expect(flights.queued).toBe(1);
  });

  it('takes icons as the nozzle reaches them, drops the extras over the pile and destroys the rest once gone', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(3), crafts: ['plane'] });
    const ctx = fakeContext();
    let stamped = 0;
    const n = 30;
    const drop = 4;

    flights.start(scoopOf(n, drop), world, 1000);
    expect(flights.count).toBe(1);
    // Nothing leaves the pile when the plane appears; the suction takes them one by one.
    flights.draw(ctx, 1000, noStamp, take);
    expect(sink.grabbed).toHaveLength(0);
    flights.draw(ctx, 1000 + 800, noStamp, take);
    expect(sink.grabbed.length).toBeGreaterThan(0);
    expect(sink.grabbed.length).toBeLessThan(n);
    const back = new Set(sink.released.map((r) => r.id));
    for (const id of sink.grabbed) expect(flights.holds(id)).toBe(!back.has(id));

    let destroyedAt: number | null = null;
    for (let now = 1800; now <= 1000 + 6000; now += 16) {
      flights.draw(ctx, now, () => stamped++, take);
      if (destroyedAt === null && sink.destroyed.length > 0) destroyedAt = now;
      // Nothing is destroyed while the plane is still crossing the canvas.
      if (now < 1000 + 4800) expect(sink.destroyed).toHaveLength(0);
    }

    expect(flights.count).toBe(0);
    expect(destroyedAt).not.toBeNull();
    expect(new Set(sink.grabbed).size).toBe(n);
    expect(sink.released).toHaveLength(drop);
    expect(sink.destroyed).toHaveLength(n - drop);
    // Every icon went one way or the other, none both ways, and none is still held.
    const gone = new Set([...sink.released.map((r) => r.id), ...sink.destroyed]);
    expect(gone.size).toBe(n);
    for (const id of gone) expect(flights.holds(id)).toBe(false);
    // The drops happened over the pile, inside the canvas and above where the icons were.
    for (const { x, y } of sink.released) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(500);
    }
    expect(stamped).toBeGreaterThan(n);
  });

  it('sends queued crafts one at a time, with a gap between them', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(4), crafts: ['plane'] });
    const ctx = fakeContext();
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.remove(10, 0);
    expect(sink.scoops).toHaveLength(1);
    flights.start(scoopOf(11, 1), world, 0);
    // Only one craft while the first is up, even once it has crossed.
    flights.draw(ctx, 500, noStamp, take);
    flights.draw(ctx, 5000, noStamp, take);
    expect(sink.scoops).toHaveLength(1);
    expect(flights.count).toBe(1);
    // Gone at 5500; the next is asked for 2 s later, and sets off when its icons arrive.
    flights.draw(ctx, 5600, noStamp, take);
    expect(flights.count).toBe(0);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 7500, noStamp, take);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 7700, noStamp, take);
    expect(sink.scoops).toHaveLength(2);
    flights.start(scoopOf(11, 1, 200), world, 7700);
    expect(flights.count).toBe(1);
    expect(flights.queued).toBe(1);
    // The gap counts from the draw that finds the craft gone.
    flights.draw(ctx, 7700 + 5500, noStamp, take);
    expect(flights.count).toBe(0);
    flights.draw(ctx, 7700 + 5500 + 1900, noStamp, take);
    expect(sink.scoops).toHaveLength(2);
    flights.draw(ctx, 7700 + 5500 + 2100, noStamp, take);
    expect(sink.scoops).toHaveLength(3);
    // An empty scoop (the pile ran out) frees the queue too.
    flights.start(scoopOf(0, 1), world, 16_000);
    expect(flights.queued).toBe(0);
    expect(flights.count).toBe(0);
  });

  it('gives every craft a turn', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(9) });
    // Each craft's own crossing shows in how long its flight lasts.
    const lengths = new Set<number>();
    for (let i = 0; i < 12; i++) {
      flights.start(scoopOf(3, 0), world, 0);
      let now = 0;
      while (flights.count > 0) flights.draw(fakeContext(), (now += 100), noStamp, take);
      lengths.add(now);
    }
    expect(lengths.size).toBe(3);
  });

  it('never drops more than it carries', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(5) });
    flights.start(scoopOf(2, 5), world, 0);
    for (let now = 0; now <= 8000; now += 16) flights.draw(fakeContext(), now, noStamp, take);
    expect(sink.released).toHaveLength(2);
    expect(sink.destroyed).toHaveLength(0);
  });

  it('forgets its flights and queue on reset without touching the icons, since the engine already has', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(7) });
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.start(scoopOf(10, 2), world, 0);
    flights.draw(fakeContext(), 500, noStamp, take);
    sink.grabbed.length = 0;
    flights.reset();
    expect(flights.count).toBe(0);
    expect(flights.queued).toBe(0);
    flights.draw(fakeContext(), 10_000, noStamp, take);
    expect(sink.grabbed).toHaveLength(0);
    expect(sink.released).toHaveLength(0);
    expect(sink.destroyed).toHaveLength(0);
    expect(sink.scoops).toHaveLength(1);
  });
});
