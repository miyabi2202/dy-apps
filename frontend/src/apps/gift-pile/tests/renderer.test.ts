import { PILE } from '../core/config';
import type { Frame } from '../core/protocol';
import { PileState } from '../render/pile-state';
import { PileRenderer } from '../render/renderer';
import { frame, mulberry32 } from './helpers';

/**
 * A 2D context that remembers which icons are painted, by centre. `clearRect` forgets the
 * ones inside the rect; everything else is a no-op. jsdom has no canvas of its own.
 */
class FakeContext {
  readonly painted = new Set<string>();
  setTransform() {}
  save() {}
  restore() {}
  beginPath() {}
  rect() {}
  clip() {}
  clearRect(x: number, y: number, w: number, h: number) {
    for (const key of this.painted) {
      const [cx, cy] = key.split(',').map(Number) as [number, number];
      if (cx >= x && cx < x + w && cy >= y && cy < y + h) this.painted.delete(key);
    }
  }
  drawImage(_image: unknown, x: number, y: number, w?: number, h?: number) {
    // The layer being copied onto the canvas has no size arguments; icons do.
    if (w === undefined || h === undefined) return;
    this.painted.add(`${x + w / 2},${y + h / 2}`);
  }
}

const contexts = new WeakMap<HTMLCanvasElement, FakeContext>();
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = new FakeContext();
      contexts.set(this, ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  // Setting a real canvas's width wipes it; the renderer relies on that to start a layer over.
  const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    ...width,
    set(this: HTMLCanvasElement, value: number) {
      contexts.get(this)?.painted.clear();
      width.set!.call(this, value);
    },
  });
});

const H = PILE.world.height;

/**
 * A pile state and a renderer over it, the canvas it draws into, and what its resting layer
 * has painted. `push` takes a frame in as the page does: into the state, and its journal on
 * to the renderer.
 */
function setup() {
  const state = new PileState(PILE, {
    world: PILE.world,
    heapAgeMs: 0,
    releaseBand: 0,
    landedSpeed: 0,
  });
  const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
  const canvas = document.createElement('canvas');
  const layer = (renderer as unknown as { layer: HTMLCanvasElement }).layer;
  const push = (f: Frame, now: number) => {
    state.apply(f, now);
    renderer.apply(state.journal);
  };
  const draw = (top = 0) => renderer.draw(canvas, 0, state, { top, height: H });
  const painted = () => contexts.get(layer)?.painted ?? new Set<string>();
  const onCanvas = () => contexts.get(canvas)?.painted ?? new Set<string>();
  return { push, draw, painted, onCanvas };
}

/** What the resting layer should show: every resting icon, by centre. */
const expected = (resting: Map<number, [number, number]>) =>
  new Set([...resting.values()].map(([x, y]) => `${x},${y}`));

describe('PileRenderer resting layer', () => {
  it('paints settled icons once and unpaints them when they leave, including the last one', () => {
    const { push, draw, painted } = setup();
    push(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
          [3, 50, 10],
          [4, 70, 10],
        ],
      }),
      0,
    );
    draw();
    expect(painted()).toEqual(new Set(['10,10', '30,10', '50,10', '70,10']));

    // The last icon in the list leaving used to stay painted as a ghost.
    push(frame({ woken: [4] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['10,10', '30,10', '50,10']));

    push(frame({ woken: [1] }), 2);
    draw();
    expect(painted()).toEqual(new Set(['30,10', '50,10']));
  });

  it('still paints an icon that was moved to fill a gap, and moved again, before a draw', () => {
    const { push, draw, painted } = setup();
    push(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
          [3, 50, 10],
          [4, 70, 10],
          [5, 90, 10],
        ],
      }),
      0,
    );
    draw();
    // 6 arrives unpainted, then fills icon 1's slot; then icon 2 leaves and 6 moves again.
    push(frame({ settled: [[6, 110, 10]], woken: [1] }), 1);
    push(frame({ woken: [2] }), 2);
    draw();
    expect(painted()).toEqual(new Set(['50,10', '70,10', '90,10', '110,10']));
  });

  it('never paints an icon that settled and was woken within the same frame', () => {
    const { push, draw, painted } = setup();
    push(frame({ settled: [[1, 10, 10]] }), 0);
    draw();
    push(frame({ settled: [[2, 30, 10]], woken: [2] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['10,10']));
  });

  it('starts over when the generation changes', () => {
    const { push, draw, painted } = setup();
    push(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
        ],
      }),
      0,
    );
    draw();
    push(frame({ generation: 1, settled: [[7, 50, 50]] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['50,50']));
  });

  it('keeps the layer equal to the resting set through random settling and waking', () => {
    const { push, draw, painted } = setup();
    const rng = mulberry32(7);
    const resting = new Map<number, [number, number]>();
    let next = 0;
    for (let step = 0; step < 200; step++) {
      const settled: [number, number, number][] = [];
      const woken: number[] = [];
      const arrivals = Math.floor(rng() * 4);
      for (let k = 0; k < arrivals; k++) {
        const id = next++;
        const at: [number, number] = [Math.floor(rng() * 40) * 10, Math.floor(rng() * 20) * 10];
        settled.push([id, ...at]);
        resting.set(id, at);
      }
      const ids = [...resting.keys()];
      const departures = Math.floor(rng() * 3);
      for (let k = 0; k < departures && ids.length; k++) {
        const id = ids.splice(Math.floor(rng() * ids.length), 1)[0]!;
        woken.push(id);
        resting.delete(id);
      }
      push(frame({ settled, woken }), step);
      // Draws happen about every other frame, so removals pile up between them.
      if (rng() < 0.5) {
        draw();
        expect(painted()).toEqual(expected(resting));
      }
    }
    draw();
    expect(painted()).toEqual(expected(resting));
  });
});

describe('PileRenderer view', () => {
  it('repaints its layer where the view has gone, and draws nothing out of view', () => {
    const { push, draw, painted, onCanvas } = setup();
    push(frame({ settled: [[1, 100, H - 50]] }), 0);
    draw();
    expect(painted()).toEqual(new Set([`100,${H - 50}`]));

    // A pile grown far above the canvas: the view goes up and leaves the old layer behind.
    push(frame({ settled: [[2, 100, -2 * H]], moving: [[3, 200, H - 50]] }), 1);
    draw(-2 * H - 300);
    // Repainted around the view: the high icon is on it, the one at the floor far below is not.
    expect(painted()).toEqual(new Set([`100,${-2 * H}`]));
    // Nor is the moving one at the floor drawn on the canvas: it is out of view.
    expect(onCanvas().has(`200,${H - 50}`)).toBe(false);
  });

  it('draws a moving icon between where the last two frames put it, by how long ago the latest arrived, and not the one in hand', () => {
    const state = new PileState(PILE, {
      world: PILE.world,
      heapAgeMs: 0,
      releaseBand: 0,
      landedSpeed: 0,
    });
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
    const canvas = document.createElement('canvas');
    state.apply(
      frame({
        time: 0,
        moving: [
          [1, 100, 100],
          [2, 300, 100],
        ],
      }),
      0,
    );
    state.apply(
      frame({
        time: 100,
        moving: [
          [1, 100, 200],
          [2, 300, 200],
        ],
      }),
      1000,
    );
    renderer.hold({ id: 2, x: 0, y: 0 });
    // Halfway through the 100 ms between frames.
    renderer.draw(canvas, 1050, state, { top: 0, height: H });
    const painted = contexts.get(canvas)!.painted;
    expect(painted.has('100,150')).toBe(true);
    expect([...painted].filter((key) => key.startsWith('300,'))).toEqual([]);
  });
});
