/** @jest-environment node */
import type { Scoop } from '../core/protocol';
import type { Board, CutInRequest, Removal, Remover } from '../removal/board';
import { RemovalDirector } from '../removal/director';
import type { Ground } from '../removal/scoop-board';
import type { RemovalSink } from '../removal/sink';
import { fakeContext } from './helpers';

class FakeSink implements RemovalSink {
  alive() {
    return 400;
  }
  add() {}
  scoop() {}
  remove() {}
  grab() {}
  release() {}
  destroy() {}
}

/** What the removal under way did and was shown. */
class Probe {
  board!: Board;
  /** The clock it was drawn with, each frame. */
  times: number[] = [];
  /** The clock `isOver` was asked with. */
  asked: number[] = [];
  /** Run in the next draw, as the removal asking for effects mid-flight. */
  next: (() => void) | null = null;
  endsAt = 1e9;
}

/** A remover whose removal ends once its clock reaches `endsAt`, and does what a test tells it in its next draw. */
function probeRemover(probe: Probe): Remover {
  return {
    name: 'probe',
    begin(board): Removal {
      probe.board = board;
      return {
        isOver: (time) => {
          probe.asked.push(time);
          return time >= probe.endsAt;
        },
        draw: (_gfx, time) => {
          probe.times.push(time);
          const run = probe.next;
          probe.next = null;
          run?.();
        },
      };
    },
  };
}

const request: CutInRequest = { name: 'probe', color: '#fff' };

const scoop: Scoop = { ids: Int32Array.of(1), xy: Float32Array.of(10, 10), drop: 0 };
const world = { width: 416, height: 708 };

function setup(cutInMs: number, endsAt = 1e9) {
  const cutIns: CutInRequest[] = [];
  const shakes: [number, number][] = [];
  const ground: Ground = {
    radius: 8,
    topAt: () => null,
    camera: { view: { top: 0, height: 708 }, moveTo: () => {} },
    stamp: () => {},
    take: () => ({ x: 10, y: 10 }),
    peek: () => ({ x: 10, y: 10, resting: true }),
    fx: { shake: (a, ms) => shakes.push([a, ms]), cutIn: (r) => cutIns.push(r) },
  };
  const probe = new Probe();
  const director = new RemovalDirector(new FakeSink(), {
    ground,
    removers: [probeRemover(probe)],
    cutInMs,
  });
  const gfx = fakeContext();
  /** A removal begins at `now`. */
  const begin = (now: number) => {
    probe.endsAt = endsAt;
    probe.times = [];
    probe.asked = [];
    director.onScoop(scoop, world, now);
  };
  begin(0);
  return { director, probe, gfx, cutIns, shakes, begin };
}

describe('RemovalDirector cut-in', () => {
  it('pauses the removal clock for cutInMs, even with freeze-frames off, then carries on from there', () => {
    const { director, probe, gfx, cutIns } = setup(500);
    director.setMotion({ cutIns: true, shake: true, hitStop: false });
    director.draw(gfx, 900);
    probe.next = () => probe.board.fx.cutIn(request);
    director.draw(gfx, 1000);
    expect(cutIns).toEqual([request]);
    director.draw(gfx, 1100);
    director.draw(gfx, 1499);
    expect(probe.times.slice(-3)).toEqual([1000, 1000, 1000]);
    director.draw(gfx, 1500);
    expect(probe.times.at(-1)).toBe(1000);
    director.draw(gfx, 1600);
    expect(probe.times.at(-1)).toBe(1100);
  });

  it('shows at most one a removal, and none within 8 s of the last, whichever removal', () => {
    const { director, probe, gfx, cutIns, begin } = setup(0);
    probe.next = () => {
      probe.board.fx.cutIn(request);
      probe.board.fx.cutIn(request);
    };
    director.draw(gfx, 1000);
    probe.next = () => probe.board.fx.cutIn(request);
    director.draw(gfx, 1100);
    expect(cutIns).toHaveLength(1);
    // A new removal 7.999 s after: still cooling down.
    begin(8000);
    probe.next = () => probe.board.fx.cutIn(request);
    director.draw(gfx, 8999);
    expect(cutIns).toHaveLength(1);
    // Its own one is spent, so the next removal asks again, a whole 8 s on.
    begin(9000);
    probe.next = () => probe.board.fx.cutIn(request);
    director.draw(gfx, 9000);
    expect(cutIns).toHaveLength(2);
  });

  it('shakes with the banner, by the request or a default, and leaves out what the settings turn off', () => {
    const on = setup(0);
    on.probe.next = () => on.probe.board.fx.cutIn({ ...request, shake: 9 });
    on.director.draw(on.gfx, 1000);
    expect(on.shakes).toEqual([[9, 300]]);

    const plain = setup(0);
    plain.probe.next = () => plain.probe.board.fx.cutIn(request);
    plain.director.draw(plain.gfx, 1000);
    expect(plain.shakes).toEqual([[4, 300]]);

    const noShake = setup(0);
    noShake.director.setMotion({ cutIns: true, shake: false, hitStop: true });
    noShake.probe.next = () => {
      noShake.probe.board.fx.cutIn(request);
      noShake.probe.board.fx.shake(6, 100);
    };
    noShake.director.draw(noShake.gfx, 1000);
    expect(noShake.cutIns).toHaveLength(1);
    expect(noShake.shakes).toEqual([]);

    const noCutIns = setup(500);
    noCutIns.director.setMotion({ cutIns: false, shake: true, hitStop: true });
    noCutIns.probe.next = () => noCutIns.probe.board.fx.cutIn(request);
    noCutIns.director.draw(noCutIns.gfx, 1000);
    noCutIns.director.draw(noCutIns.gfx, 1100);
    expect(noCutIns.cutIns).toEqual([]);
    expect(noCutIns.shakes).toEqual([]);
    // No banner, no pause.
    expect(noCutIns.probe.times.at(-1)).toBe(1100);
  });
});

describe('RemovalDirector freeze', () => {
  it('holds the clock until the later of overlapping freezes, then carries on', () => {
    const { director, probe, gfx } = setup(0);
    probe.next = () => probe.board.fx.hitStop(300); // until 1300
    director.draw(gfx, 1000);
    probe.next = () => probe.board.fx.hitStop(100); // until 1200: no sooner
    director.draw(gfx, 1100);
    probe.next = () => probe.board.fx.hitStop(500); // until 1700: later
    director.draw(gfx, 1200);
    director.draw(gfx, 1300);
    director.draw(gfx, 1699);
    expect(probe.times.slice(-5)).toEqual([1000, 1000, 1000, 1000, 1000]);
    director.draw(gfx, 1700);
    director.draw(gfx, 1800);
    expect(probe.times.slice(-2)).toEqual([1000, 1100]);
  });

  it('does nothing when freeze-frames are off, or the time asked for is nothing', () => {
    const { director, probe, gfx } = setup(0);
    director.setMotion({ cutIns: true, shake: true, hitStop: false });
    probe.next = () => probe.board.fx.hitStop(300);
    director.draw(gfx, 1000);
    director.draw(gfx, 1100);
    expect(probe.times.slice(-2)).toEqual([1000, 1100]);
    director.setMotion({ cutIns: true, shake: true, hitStop: true });
    probe.next = () => probe.board.fx.hitStop(0);
    director.draw(gfx, 1200);
    probe.next = () => probe.board.fx.hitStop(Number.NaN);
    director.draw(gfx, 1300);
    expect(probe.times.slice(-2)).toEqual([1200, 1300]);
  });

  it('adds up what was frozen, and isOver sees the same time as the drawing does', () => {
    const { director, probe, gfx } = setup(0, 2000);
    director.draw(gfx, 500);
    probe.next = () => probe.board.fx.hitStop(1000);
    director.draw(gfx, 600);
    probe.next = () => probe.board.fx.hitStop(400);
    // Frozen at 600 until 1600: not over however long, as it stands still.
    director.draw(gfx, 1000);
    director.draw(gfx, 1599);
    expect(probe.asked.slice(-2)).toEqual([600, 600]);
    expect(director.busy).toBe(true);
    // The second freeze came while frozen: it lengthened nothing (1000 + 400 from 1000 is 1400 < 1600).
    director.draw(gfx, 1600);
    expect(probe.asked.at(-1)).toBe(600);
    // 1 s frozen, so wall 3000 is the removal's 2000.
    director.draw(gfx, 2999);
    expect(director.busy).toBe(true);
    director.draw(gfx, 3000);
    expect(probe.asked.at(-1)).toBe(2000);
    expect(director.busy).toBe(false);
  });
});
