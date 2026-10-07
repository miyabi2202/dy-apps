/** @jest-environment node */
import type { Scoop } from '../core/protocol';
import {
  planRemoval,
  VACUUM_CAPACITY,
  VacuumFlights,
  type FlightSink,
} from '../render/vacuum-flight';
import { mulberry32 } from './helpers';

/** Remembers what a flight does to the engine's icons. */
class FakeSink implements FlightSink {
  released: { id: number; x: number; y: number }[] = [];
  destroyed: number[] = [];
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
      key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined,
    set: () => true,
  });

const world = { width: 416, height: 708 };

/** `n` icons in a row along the top of a pile, with `drop` of them to come back. */
const scoopOf = (n: number, drop: number): Scoop => ({
  ids: Int32Array.from({ length: n }, (_, k) => 100 + k),
  xy: Float32Array.from({ length: 2 * n }, (_, i) => (i % 2 === 0 ? 20 + (i / 2) * 12 : 500)),
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
  it('drops the extras back over the pile during the crossing and destroys the rest once gone', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(3) });
    const ctx = fakeContext();
    const stamped: number[] = [];
    const stamp = () => stamped.push(1);
    const n = 30;
    const drop = 4;

    flights.start(scoopOf(n, drop), world, 1000);
    expect(flights.count).toBe(1);

    // Draw through the flight at display rate.
    let destroyedAt: number | null = null;
    for (let now = 1000; now <= 1000 + 4000; now += 16) {
      flights.draw(ctx, now, stamp);
      if (destroyedAt === null && sink.destroyed.length > 0) destroyedAt = now;
      // Nothing is destroyed while the plane is still crossing the canvas.
      if (now < 1000 + 2400) expect(sink.destroyed).toHaveLength(0);
    }

    expect(flights.count).toBe(0);
    expect(destroyedAt).not.toBeNull();
    expect(sink.released).toHaveLength(drop);
    expect(sink.destroyed).toHaveLength(n - drop);
    // Every icon went one way or the other, and none both ways.
    const gone = new Set([...sink.released.map((r) => r.id), ...sink.destroyed]);
    expect(gone.size).toBe(n);
    // The drops happened over the pile, inside the canvas and above where the icons were.
    for (const { x, y } of sink.released) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(500);
    }
    // Icons were drawn while the plane was crossing.
    expect(stamped.length).toBeGreaterThan(n);
  });

  it('never drops more than it carries', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(5) });
    flights.start(scoopOf(2, 5), world, 0);
    for (let now = 0; now <= 4000; now += 16) flights.draw(fakeContext(), now, () => {});
    expect(sink.released).toHaveLength(2);
    expect(sink.destroyed).toHaveLength(0);
  });

  it('forgets its flights on reset without touching the icons, since the engine already has', () => {
    const sink = new FakeSink();
    const flights = new VacuumFlights(sink, { rng: mulberry32(7) });
    flights.start(scoopOf(10, 2), world, 0);
    flights.draw(fakeContext(), 500, () => {});
    flights.reset();
    expect(flights.count).toBe(0);
    flights.draw(fakeContext(), 10_000, () => {});
    expect(sink.released).toHaveLength(0);
    expect(sink.destroyed).toHaveLength(0);
  });
});
