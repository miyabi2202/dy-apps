import { PILE } from '../core/config';
import type { Hooks, Overlay } from '../render/overlay';
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

/** A renderer, the canvas it draws into, and what its resting layer has painted. */
function setup() {
  const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
  const canvas = document.createElement('canvas');
  const layer = (renderer as unknown as { layer: HTMLCanvasElement }).layer;
  const draw = () => renderer.draw(canvas, 0);
  const painted = () => contexts.get(layer)?.painted ?? new Set<string>();
  return { renderer, draw, painted };
}

/** What the resting layer should show: every resting icon, by centre. */
const expected = (resting: Map<number, [number, number]>) =>
  new Set([...resting.values()].map(([x, y]) => `${x},${y}`));

describe('PileRenderer resting layer', () => {
  it('paints settled icons once and unpaints them when they leave, including the last one', () => {
    const { renderer, draw, painted } = setup();
    renderer.pushFrame(
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
    renderer.pushFrame(frame({ woken: [4] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['10,10', '30,10', '50,10']));

    renderer.pushFrame(frame({ woken: [1] }), 2);
    draw();
    expect(painted()).toEqual(new Set(['30,10', '50,10']));
  });

  it('still paints an icon that was moved to fill a gap, and moved again, before a draw', () => {
    const { renderer, draw, painted } = setup();
    renderer.pushFrame(
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
    renderer.pushFrame(frame({ settled: [[6, 110, 10]], woken: [1] }), 1);
    renderer.pushFrame(frame({ woken: [2] }), 2);
    draw();
    expect(painted()).toEqual(new Set(['50,10', '70,10', '90,10', '110,10']));
  });

  it('never paints an icon that settled and was woken within the same frame', () => {
    const { renderer, draw, painted } = setup();
    renderer.pushFrame(frame({ settled: [[1, 10, 10]] }), 0);
    draw();
    renderer.pushFrame(frame({ settled: [[2, 30, 10]], woken: [2] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['10,10']));
  });

  it('starts over when the generation changes', () => {
    const { renderer, draw, painted } = setup();
    renderer.pushFrame(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
        ],
      }),
      0,
    );
    draw();
    renderer.pushFrame(frame({ generation: 1, settled: [[7, 50, 50]] }), 1);
    draw();
    expect(painted()).toEqual(new Set(['50,50']));
  });

  it('keeps the layer equal to the resting set through random settling and waking', () => {
    const { renderer, draw, painted } = setup();
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
      renderer.pushFrame(frame({ settled, woken }), step);
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

describe('PileRenderer overlay', () => {
  it('hands the overlay its scoops, lets it take icons off the layer and see where they are, and keeps its icons from the user', () => {
    const scoops: number[][] = [];
    const seen: unknown[] = [];
    let ask: ((hooks: Hooks) => void) | null = null;
    const overlay: Overlay = {
      onScoop: (scoop) => scoops.push([...scoop.ids]),
      reset: () => {},
      holds: (id) => id === 1 || id === 3,
      draw: (_ctx, _now, hooks) => ask?.(hooks),
    };
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource, overlay);
    const canvas = document.createElement('canvas');
    const layer = (renderer as unknown as { layer: HTMLCanvasElement }).layer;
    const painted = () => contexts.get(layer)?.painted ?? new Set<string>();
    renderer.pushFrame(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
        ],
        moving: [[3, 50, 40]],
        scooped: [
          { ids: Int32Array.from([1, 3]), xy: Float32Array.from([10, 10, 50, 40]), drop: 0 },
        ],
      }),
      0,
    );
    expect(scoops).toEqual([[1, 3]]);

    ask = (hooks) => {
      seen.push(hooks.peek(1), hooks.peek(3), hooks.peek(9));
      seen.push(hooks.take(1), hooks.take(3));
    };
    renderer.draw(canvas, 0);
    expect(seen).toEqual([
      { x: 10, y: 10, resting: true },
      { x: 50, y: 40, resting: false },
      null,
      { x: 10, y: 10, resting: true },
      { x: 50, y: 40, resting: false },
    ]);
    // Taken, the resting one is off the layer at once; the user can't pick up either.
    ask = null;
    renderer.draw(canvas, 1);
    expect(painted()).toEqual(new Set(['30,10']));
    expect(renderer.iconAt(10, 10)).toBeNull();
    expect(renderer.iconAt(50, 40)).toBeNull();
    expect(renderer.iconAt(30, 10)).toBe(2);
  });
});

describe('PileRenderer pile top', () => {
  it('finds the highest icon near a point across, resting or moving, and none where there are none', () => {
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
    renderer.pushFrame(
      frame({
        settled: [
          [1, 100, 600],
          [2, 108, 590],
          [3, 300, 640],
        ],
        moving: [[4, 300, 500]],
      }),
      0,
    );
    expect(renderer.topAt(104)).toBe(590);
    expect(renderer.topAt(300)).toBe(500);
    expect(renderer.topAt(200)).toBeNull();
    // A frame with the moving one settled lower: the top follows.
    renderer.pushFrame(frame({ settled: [[4, 300, 630]] }), 1);
    expect(renderer.topAt(300)).toBe(630);
  });
});

describe('PileRenderer camera', () => {
  const H = PILE.world.height;
  /** Draw every 16 ms from `from` to `to`, as the page's loop would. */
  const drawFor = (renderer: PileRenderer, canvas: HTMLCanvasElement, from: number, to: number) => {
    for (let now = from; now <= to; now += 16) renderer.draw(canvas, now);
  };
  /** Where the view's top should be to keep the headroom clear over a pile topped at `top`. */
  const over = (top: number) => top - PILE.radius - PILE.headroom * H;

  it('stays at the floor for a low pile, follows one that grows into its headroom up, and back down', () => {
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
    const canvas = document.createElement('canvas');
    renderer.pushFrame(frame({ settled: [[1, 100, 600]] }), 0);
    drawFor(renderer, canvas, 0, 2000);
    expect(renderer.view.top).toBe(0);

    renderer.pushFrame(frame({ settled: [[2, 100, -300]] }), 2000);
    drawFor(renderer, canvas, 2000, 6000);
    expect(renderer.view.top).toBeCloseTo(over(-300), 0);

    // The high one goes: back down to the floor.
    renderer.pushFrame(frame({ woken: [2] }), 6000);
    drawFor(renderer, canvas, 6000, 10000);
    expect(renderer.view.top).toBe(0);
  });

  it('holds still while the overlay is busy, and moves on once it is not', () => {
    let busy = true;
    const overlay: Overlay = {
      onScoop: () => {},
      reset: () => {},
      holds: () => false,
      draw: () => {},
      get busy() {
        return busy;
      },
    };
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource, overlay);
    const canvas = document.createElement('canvas');
    renderer.pushFrame(frame({ settled: [[1, 100, -300]] }), 0);
    drawFor(renderer, canvas, 0, 3000);
    expect(renderer.view.top).toBe(0);
    busy = false;
    drawFor(renderer, canvas, 3000, 7000);
    expect(renderer.view.top).toBeCloseTo(over(-300), 0);
  });
});

describe('PileRenderer camera, moved by the overlay', () => {
  it('goes where a busy overlay asks, never below the floor, and back to following the pile after', () => {
    let busy = true;
    let ask: number | null = -500;
    const overlay: Overlay = {
      onScoop: () => {},
      reset: () => {},
      holds: () => false,
      draw: (_ctx, _now, hooks) => {
        if (ask !== null) hooks.camera.moveTo(ask);
      },
      get busy() {
        return busy;
      },
    };
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource, overlay);
    const canvas = document.createElement('canvas');
    renderer.pushFrame(frame({ settled: [[1, 100, 600]] }), 0);
    for (let now = 0; now <= 4000; now += 16) renderer.draw(canvas, now);
    expect(renderer.view.top).toBeCloseTo(-500, 0);
    ask = 300;
    for (let now = 4000; now <= 8000; now += 16) renderer.draw(canvas, now);
    expect(renderer.view.top).toBe(0);
    // Done: it follows the pile again, which is low.
    ask = -500;
    busy = false;
    for (let now = 8000; now <= 12000; now += 16) renderer.draw(canvas, now);
    expect(renderer.view.top).toBe(0);
  });
});

describe('PileRenderer camera, its watchers and layer', () => {
  const H = PILE.world.height;

  it('tells its watcher each time it moves, and stops when unwatched', () => {
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
    const canvas = document.createElement('canvas');
    const seen: number[] = [];
    renderer.watchCamera((top) => seen.push(top));
    renderer.pushFrame(frame({ settled: [[1, 100, -300]] }), 0);
    for (let now = 0; now <= 3000; now += 16) renderer.draw(canvas, now);
    expect(seen.length).toBeGreaterThan(1);
    // Easing up, never past where it ends.
    for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeLessThanOrEqual(seen[k - 1]!);
    expect(seen[seen.length - 1]).toBe(renderer.view.top);
    const count = seen.length;
    renderer.watchCamera(null);
    renderer.pushFrame(frame({ woken: [1] }), 3000);
    for (let now = 3000; now <= 6000; now += 16) renderer.draw(canvas, now);
    expect(seen).toHaveLength(count);
  });

  it('repaints its layer where the view has gone, and draws nothing out of view', () => {
    const renderer = new PileRenderer(PILE, () => ({}) as CanvasImageSource);
    const canvas = document.createElement('canvas');
    const layer = (renderer as unknown as { layer: HTMLCanvasElement }).layer;
    const painted = () => contexts.get(layer)?.painted ?? new Set<string>();
    renderer.pushFrame(frame({ settled: [[1, 100, H - 50]] }), 0);
    renderer.draw(canvas, 0);
    expect(painted()).toEqual(new Set([`100,${H - 50}`]));

    // A pile grown far above the canvas: the view goes up and leaves the old layer behind.
    renderer.pushFrame(frame({ settled: [[2, 100, -2 * H]], moving: [[3, 200, H - 50]] }), 1);
    for (let now = 0; now <= 4000; now += 16) renderer.draw(canvas, now);
    const { top } = renderer.view;
    expect(top).toBeLessThan(-2 * H);
    // Repainted around the view: the high icon is on it, the one at the floor far below is not.
    expect(painted()).toEqual(new Set([`100,${-2 * H}`]));
    // Nor is the moving one at the floor drawn on the canvas: it is out of view.
    expect(contexts.get(canvas)?.painted.has(`200,${H - 50}`)).toBe(false);
  });
});
