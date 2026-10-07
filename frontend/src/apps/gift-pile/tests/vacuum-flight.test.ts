/** @jest-environment node */
import type { Scoop } from '../core/protocol';
import { PaperPlane } from '../render/crafts/paper-plane';
import {
  planRemoval,
  VACUUM_CAPACITY,
  VacuumFlights,
  type FlightSink,
} from '../render/vacuum-flight';
import { mulberry32 } from './helpers';

/** Remembers what the flights ask of the engine. */
class FakeSink implements FlightSink {
  /** What the engine would say is in the pile. */
  inPile = 400;
  added: number[] = [];
  scoops: { count: number; extra: number }[] = [];
  removed: number[] = [];
  grabbed: number[] = [];
  released: { id: number; x: number; y: number }[] = [];
  destroyed: number[] = [];
  alive() {
    return this.inPile;
  }
  add(count: number) {
    this.added.push(count);
  }
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
const hooks = { stamp: noStamp, take, peek: (id: number) => ({ ...take(id), resting: true }) };

/** `n` icons in a row along the top of a pile, with `drop` of them to come back. */
const scoopOf = (n: number, drop: number, from = 100): Scoop => ({
  ids: Int32Array.from({ length: n }, (_, k) => from + k),
  xy: Float32Array.from({ length: 2 * n }, (_, i) =>
    i % 2 === 0 ? 20 + ((from - 100 + i / 2) % 33) * 12 : 500,
  ),
  drop,
});

describe('planRemoval', () => {
  it('takes a quarter more than asked and drops half of it, while the pile has more than asked', () => {
    expect(planRemoval(40, 400)).toEqual({ fly: 50, drop: 25, instant: 0 });
    expect(planRemoval(1, 400)).toEqual({ fly: 1, drop: 0, instant: 0 });
    expect(planRemoval(30, 400)).toEqual({ fly: 38, drop: 19, instant: 0 });
    // A pile between the number and a quarter more: all of it, half dropped.
    expect(planRemoval(40, 45)).toEqual({ fly: 45, drop: 22, instant: 0 });
  });

  it('takes everything and drops nothing when the pile has no more than asked', () => {
    expect(planRemoval(40, 40)).toEqual({ fly: 40, drop: 0, instant: 0 });
    expect(planRemoval(40, 12)).toEqual({ fly: 12, drop: 0, instant: 0 });
    expect(planRemoval(40, 0)).toEqual({ fly: 0, drop: 0, instant: 0 });
    expect(planRemoval(0, 40)).toEqual({ fly: 0, drop: 0, instant: 0 });
  });

  it('flies what one craft can carry and removes the rest at once', () => {
    expect(planRemoval(VACUUM_CAPACITY + 400, 5000)).toEqual({
      fly: VACUUM_CAPACITY,
      drop: 1500,
      instant: 1000,
    });
    expect(planRemoval(VACUUM_CAPACITY + 400, 2200)).toEqual({
      fly: VACUUM_CAPACITY,
      drop: 0,
      instant: 200,
    });
  });
});

describe('VacuumFlights', () => {
  it('asks for a scoop at once from the pile as it is then, and removes anything over a load on the spot', () => {
    const sink = new FakeSink();
    sink.inPile = 5000;
    const flights = new VacuumFlights(sink, { crafts: [new PaperPlane()] });
    flights.remove(30, 0);
    expect(sink.scoops).toEqual([{ count: 38, extra: 19 }]);
    expect(sink.removed).toEqual([]);
    // The second removal waits for the first scoop to come back and its craft to go, and
    // is planned from the pile as it is then.
    flights.remove(VACUUM_CAPACITY + 10, 0);
    expect(sink.removed).toEqual([]);
    expect(sink.scoops).toHaveLength(1);
    expect(flights.queued).toBe(1);
    flights.start(scoopOf(38, 19), world, 0);
    const ctx = fakeContext();
    sink.inPile = 30;
    for (let now = 0; now <= 7000; now += 100) flights.draw(ctx, now, hooks);
    expect(sink.removed).toEqual([]);
    expect(sink.scoops).toEqual([
      { count: 38, extra: 19 },
      { count: 30, extra: 0 },
    ]);
  });

  it('destroys a dropped icon that falls into the bin, and forgets one that lands', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(6), crafts: [new PaperPlane()] });
    const ctx = fakeContext();
    let caught = 0;
    flights.setBin({ x: 200, y: 600, half: 25, onCatch: () => caught++ });
    const n = 10;
    flights.start(scoopOf(n, 2), world, 0);
    // The first icon dropped falls through the bin; the second lands on the pile.
    const peek = (id: number) => {
      const k = sink.released.findIndex((r) => r.id === id);
      if (k === 0) return { x: 190, y: 610, resting: false };
      if (k === 1) return { x: 300, y: 500, resting: true };
      return { ...take(id), resting: true };
    };
    for (let now = 0; now <= 7000; now += 16) flights.draw(ctx, now, { ...hooks, peek });
    expect(sink.released).toHaveLength(2);
    const [inBin, onPile] = sink.released.map((r) => r.id);
    expect(sink.destroyed).toContain(inBin);
    expect(sink.destroyed).not.toContain(onPile);
    expect(sink.destroyed).toHaveLength(n - 1);
    expect(caught).toBe(1);
  });

  it('adds at once when nothing is up, and after the craft is gone when one is', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(2), crafts: [new PaperPlane()] });
    const ctx = fakeContext();
    flights.add(50, 0);
    expect(sink.added).toEqual([50]);
    expect(flights.pendingAdds).toBe(0);

    flights.remove(10, 0);
    flights.start(scoopOf(11, 1), world, 0);
    flights.add(20, 100);
    flights.remove(10, 100);
    flights.add(30, 100);
    expect(sink.added).toEqual([50]);
    expect(flights.pendingAdds).toBe(50);
    expect(flights.queued).toBe(3);
    flights.draw(ctx, 3000, hooks);
    expect(sink.added).toEqual([50]);
    // The craft is gone: the first addition goes at once, then the next craft after the gap,
    // and the last addition only once that one is gone too.
    flights.draw(ctx, 5600, hooks);
    expect(sink.added).toEqual([50, 20]);
    expect(flights.pendingAdds).toBe(30);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 6700, hooks);
    expect(sink.scoops).toHaveLength(2);
    expect(sink.added).toEqual([50, 20]);
    flights.start(scoopOf(11, 1, 200), world, 6700);
    flights.draw(ctx, 6700 + 5500, hooks);
    expect(sink.added).toEqual([50, 20, 30]);
    expect(flights.queued).toBe(0);
  });

  it('takes icons as the nozzle reaches them, drops the extras over the pile and destroys the rest once gone', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(3), crafts: [new PaperPlane()] });
    const ctx = fakeContext();
    let stamped = 0;
    const n = 30;
    const drop = 4;

    flights.start(scoopOf(n, drop), world, 1000);
    expect(flights.count).toBe(1);
    // Nothing leaves the pile when the plane appears; the suction takes them one by one.
    flights.draw(ctx, 1000, hooks);
    expect(sink.grabbed).toHaveLength(0);
    flights.draw(ctx, 1000 + 800, hooks);
    expect(sink.grabbed.length).toBeGreaterThan(0);
    expect(sink.grabbed.length).toBeLessThan(n);
    const back = new Set(sink.released.map((r) => r.id));
    for (const id of sink.grabbed) expect(flights.holds(id)).toBe(!back.has(id));

    let destroyedAt: number | null = null;
    for (let now = 1800; now <= 1000 + 6000; now += 16) {
      flights.draw(ctx, now, { ...hooks, stamp: () => stamped++ });
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

  it('sends queued crafts one at a time, with a second between them', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(4), crafts: [new PaperPlane()] });
    const ctx = fakeContext();
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.remove(10, 0);
    expect(sink.scoops).toHaveLength(1);
    flights.start(scoopOf(11, 1), world, 0);
    // Only one craft while the first is up, even once it has crossed.
    flights.draw(ctx, 500, hooks);
    flights.draw(ctx, 5000, hooks);
    expect(sink.scoops).toHaveLength(1);
    expect(flights.count).toBe(1);
    // Gone at 5500; the next is asked for 1 s later, and sets off when its icons arrive.
    flights.draw(ctx, 5600, hooks);
    expect(flights.count).toBe(0);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 6500, hooks);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 6700, hooks);
    expect(sink.scoops).toHaveLength(2);
    flights.start(scoopOf(11, 1, 200), world, 6700);
    expect(flights.count).toBe(1);
    expect(flights.queued).toBe(1);
    // The gap counts from the draw that finds the craft gone.
    flights.draw(ctx, 6700 + 5500, hooks);
    expect(flights.count).toBe(0);
    flights.draw(ctx, 6700 + 5500 + 900, hooks);
    expect(sink.scoops).toHaveLength(2);
    flights.draw(ctx, 6700 + 5500 + 1100, hooks);
    expect(sink.scoops).toHaveLength(3);
    // An empty scoop (the pile ran out) frees the queue too.
    flights.start(scoopOf(0, 1), world, 16_000);
    expect(flights.queued).toBe(0);
    expect(flights.count).toBe(0);
  });

  it('never drops more than it carries', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(5) });
    flights.start(scoopOf(2, 5), world, 0);
    for (let now = 0; now <= 8000; now += 16) flights.draw(fakeContext(), now, hooks);
    expect(sink.released).toHaveLength(2);
    expect(sink.destroyed).toHaveLength(0);
  });

  it('forgets its flights and queue on reset without touching the icons, since the engine already has', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(7) });
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.start(scoopOf(10, 2), world, 0);
    flights.draw(fakeContext(), 500, hooks);
    sink.grabbed.length = 0;
    flights.reset();
    expect(flights.count).toBe(0);
    expect(flights.queued).toBe(0);
    flights.draw(fakeContext(), 10_000, hooks);
    expect(sink.grabbed).toHaveLength(0);
    expect(sink.released).toHaveLength(0);
    expect(sink.destroyed).toHaveLength(0);
    expect(sink.scoops).toHaveLength(1);
  });
});
