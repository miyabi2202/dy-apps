/** @jest-environment node */
import type { Scoop } from '../core/protocol';
import { RemovalDirector } from '../removal/director';
import type { Board, Remover } from '../removal/board';
import { climbAway } from '../removal/kit/climb-away';
import type { Course, Craft } from '../removal/kit/craft';
import { Crossing } from '../removal/kit/crossing';
import { Vacuum } from '../removal/kit/vacuum';
import { allRemovers } from '../removal/removers';
import { LOAD_CAPACITY } from '../removal/queue';
import type { RemovalSink } from '../removal/sink';
import { mulberry32 } from './helpers';

/** A plain craft that tows the vacuum over at a steady 4.8 s, drawing nothing. */
class TestCraft implements Craft, Remover {
  readonly name = 'test';
  readonly crossMs = 4800;
  readonly tie = { dx: -5, dy: 13 };
  readonly intake = new Vacuum();
  minY() {
    return 44;
  }
  sag() {
    return 0;
  }
  pathAt(course: Course, px: number) {
    const { climb, tilt } = climbAway(course, px);
    return { py: course.altitude - climb, tilt };
  }
  draw() {}
  begin(board: Board, now: number, rng: () => number) {
    return new Crossing(this, board, now, rng);
  }
}

const testRemovers = () => [new TestCraft()];

/** Remembers what the flights ask of the engine. */
class FakeSink implements RemovalSink {
  /** What the engine would say is in the pile. */
  inPile = 400;
  added: number[] = [];
  scoops: { count: number; extra: number; near?: number }[] = [];
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
  scoop(count: number, extra: number, near?: number) {
    this.scoops.push(near === undefined ? { count, extra } : { count, extra, near });
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
const hooks = {
  radius: 8,
  stamp: noStamp,
  take,
  peek: (id: number) => ({ ...take(id), resting: true }),
};

/** `n` icons in a row along the top of a pile, with `drop` of them to come back. */
const scoopOf = (n: number, drop: number, from = 100): Scoop => ({
  ids: Int32Array.from({ length: n }, (_, k) => from + k),
  xy: Float32Array.from({ length: 2 * n }, (_, i) =>
    i % 2 === 0 ? 20 + ((from - 100 + i / 2) % 33) * 12 : 500,
  ),
  drop,
});

describe('RemovalDirector', () => {
  it('asks for a scoop at once from the pile as it is then, and removes anything over a load on the spot', () => {
    const sink = new FakeSink();
    sink.inPile = 5000;
    const flights = new RemovalDirector(sink, { removers: testRemovers() });
    flights.remove(30, 0);
    expect(sink.scoops).toEqual([{ count: 38, extra: 7 }]);
    expect(sink.removed).toEqual([]);
    // The second removal waits for the first scoop to come back and its craft to go, and
    // is planned from the pile as it is then.
    flights.remove(LOAD_CAPACITY + 10, 0);
    expect(sink.removed).toEqual([]);
    expect(sink.scoops).toHaveLength(1);
    expect(flights.queued).toBe(1);
    flights.onScoop(scoopOf(38, 7), world, 0);
    const ctx = fakeContext();
    sink.inPile = 30;
    for (let now = 0; now <= 7000; now += 100) flights.draw(ctx, now, hooks);
    expect(sink.removed).toEqual([]);
    expect(sink.scoops).toEqual([
      { count: 38, extra: 7 },
      { count: 30, extra: 0 },
    ]);
  });

  it('destroys a dropped icon that falls into the bin, and forgets one that lands', () => {
    const sink = new FakeSink();
    const flights = new RemovalDirector(sink, { rng: mulberry32(6), removers: testRemovers() });
    const ctx = fakeContext();
    let caught = 0;
    flights.setBin({ x: 200, y: 600, half: 25, onCatch: () => caught++ });
    const n = 10;
    flights.onScoop(scoopOf(n, 2), world, 0);
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
    const flights = new RemovalDirector(sink, { rng: mulberry32(2), removers: testRemovers() });
    const ctx = fakeContext();
    flights.add(50, 0);
    expect(sink.added).toEqual([50]);
    expect(flights.pendingAdds).toBe(0);

    flights.remove(10, 0);
    flights.onScoop(scoopOf(11, 1), world, 0);
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
    flights.onScoop(scoopOf(11, 1, 200), world, 6700);
    flights.draw(ctx, 6700 + 5500, hooks);
    expect(sink.added).toEqual([50, 20, 30]);
    expect(flights.queued).toBe(0);
  });

  it('takes icons as the nozzle reaches them, drops the extras over the pile and destroys the rest once gone', () => {
    const sink = new FakeSink();
    const flights = new RemovalDirector(sink, { rng: mulberry32(3), removers: testRemovers() });
    const ctx = fakeContext();
    let stamped = 0;
    const n = 30;
    const drop = 4;

    flights.onScoop(scoopOf(n, drop), world, 1000);
    expect(flights.busy).toBe(true);
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

    expect(flights.busy).toBe(false);
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
    const flights = new RemovalDirector(sink, { rng: mulberry32(4), removers: testRemovers() });
    const ctx = fakeContext();
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.remove(10, 0);
    expect(sink.scoops).toHaveLength(1);
    flights.onScoop(scoopOf(11, 1), world, 0);
    // Only one craft while the first is up, even once it has crossed.
    flights.draw(ctx, 500, hooks);
    flights.draw(ctx, 5000, hooks);
    expect(sink.scoops).toHaveLength(1);
    expect(flights.busy).toBe(true);
    // Gone at 5500; the next is asked for 1 s later, and sets off when its icons arrive.
    flights.draw(ctx, 5600, hooks);
    expect(flights.busy).toBe(false);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 6500, hooks);
    expect(sink.scoops).toHaveLength(1);
    flights.draw(ctx, 6700, hooks);
    expect(sink.scoops).toHaveLength(2);
    flights.onScoop(scoopOf(11, 1, 200), world, 6700);
    expect(flights.busy).toBe(true);
    expect(flights.queued).toBe(1);
    // The gap counts from the draw that finds the craft gone.
    flights.draw(ctx, 6700 + 5500, hooks);
    expect(flights.busy).toBe(false);
    flights.draw(ctx, 6700 + 5500 + 900, hooks);
    expect(sink.scoops).toHaveLength(2);
    flights.draw(ctx, 6700 + 5500 + 1100, hooks);
    expect(sink.scoops).toHaveLength(3);
    // An empty scoop (the pile ran out) frees the queue too.
    flights.onScoop(scoopOf(0, 1), world, 16_000);
    expect(flights.queued).toBe(0);
    expect(flights.busy).toBe(false);
  });

  it('never drops more than it carries', () => {
    const sink = new FakeSink();
    const flights = new RemovalDirector(sink, { removers: allRemovers(), rng: mulberry32(5) });
    flights.onScoop(scoopOf(2, 5), world, 0);
    for (let now = 0; now <= 8000; now += 16) flights.draw(fakeContext(), now, hooks);
    expect(sink.released).toHaveLength(2);
    expect(sink.destroyed).toHaveLength(0);
  });

  it('deals the remover before asking for its icons, so it can aim them, and runs that one on them', () => {
    const sink = new FakeSink();
    const began: { name: string; icons: number }[] = [];
    // Two removers taking turns: one aims, one doesn't; each ends as soon as it begins.
    const remover = (name: string, aim?: number): Remover => ({
      name,
      ...(aim === undefined ? {} : { aim: () => aim }),
      begin: (board) => {
        began.push({ name, icons: board.icons.length });
        return { isOver: () => true, draw: () => {} };
      },
    });
    const flights = new RemovalDirector(sink, {
      removers: [remover('aims', 0.3), remover('plain')],
      rng: mulberry32(8),
    });
    for (let k = 0; k < 4; k++) {
      flights.remove(10, k * 2000);
      const asked = sink.scoops[k]!;
      flights.onScoop(scoopOf(12, 2), world, k * 2000);
      flights.draw(fakeContext(), k * 2000 + 1, hooks);
      // The one that begins is the one dealt when the scoop was asked for.
      expect(began[k]!.name).toBe(asked.near === 0.3 ? 'aims' : 'plain');
      expect(began[k]!.icons).toBe(12);
    }
    // The bag deals each once a round, never the same twice running.
    expect(began.map((b) => b.name).filter((name) => name === 'aims')).toHaveLength(2);
  });

  it('forgets its flights and queue on reset without touching the icons, since the engine already has', () => {
    const sink = new FakeSink();
    const flights = new RemovalDirector(sink, { removers: allRemovers(), rng: mulberry32(7) });
    flights.remove(10, 0);
    flights.remove(10, 0);
    flights.onScoop(scoopOf(10, 2), world, 0);
    flights.draw(fakeContext(), 500, hooks);
    sink.grabbed.length = 0;
    flights.reset();
    expect(flights.busy).toBe(false);
    expect(flights.queued).toBe(0);
    flights.draw(fakeContext(), 10_000, hooks);
    expect(sink.grabbed).toHaveLength(0);
    expect(sink.released).toHaveLength(0);
    expect(sink.destroyed).toHaveLength(0);
    expect(sink.scoops).toHaveLength(1);
  });
});
