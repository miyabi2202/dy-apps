/** @jest-environment node */
import { PILE } from '../core/config';
import type { Scoop } from '../core/protocol';
import { Pile, type PileDrawing, type PileLink } from '../pile';
import type { Board, Remover } from '../removal/board';
import { Camera } from '../render/camera';
import { PileState } from '../render/pile-state';
import { frame } from './helpers';

/** The worker's client, remembering what it was sent, in `log` with everything else. */
class FakeClient implements PileLink {
  stats = { total: 0, moving: 0, queued: 0 };
  error = null;
  readonly scoops: { count: number; extra: number }[] = [];
  readonly added: number[] = [];
  readonly dropLines: number[] = [];
  readonly held: string[] = [];
  constructor(private readonly log: string[]) {}
  start() {}
  stop() {}
  alive() {
    return this.stats.total;
  }
  add(count: number) {
    this.added.push(count);
  }
  remove() {}
  scoop(count: number, extra: number) {
    this.scoops.push({ count, extra });
  }
  clear() {}
  resize() {}
  grab(id: number) {
    this.held.push(`grab:${id}`);
  }
  release(id: number, x: number, y: number) {
    this.held.push(`release:${id}@${x},${y}`);
  }
  destroy(id: number) {
    this.held.push(`destroy:${id}`);
  }
  setDropLine(y: number) {
    this.dropLines.push(y);
    this.log.push('dropLine');
  }
}

/** The renderer, remembering what it was asked, and leaving the journal as the real one does. */
class FakeRenderer implements PileDrawing {
  readonly removals: number[][] = [];
  readonly stamps: unknown[][] = [];
  readonly holds: unknown[] = [];
  readonly ctx = {} as CanvasRenderingContext2D;
  constructor(private readonly log: string[]) {}
  apply(journal: Parameters<PileDrawing['apply']>[0]) {
    if (journal.removed.length > 0) this.removals.push([...journal.removed]);
    journal.clear();
  }
  draw() {
    this.log.push('draw');
    return this.ctx;
  }
  drawHeld() {
    this.log.push('held');
  }
  hold(held: unknown) {
    this.holds.push(held);
  }
  stamp(ctx: unknown, x: number, y: number, scale?: number) {
    this.stamps.push([ctx, x, y, scale]);
  }
  setImage() {}
}

const world = { width: PILE.world.width, height: PILE.world.height };
/** Where the camera should be to keep the headroom clear over a pile topped at `top`. */
const over = (top: number) => top - PILE.radius - PILE.headroom * world.height;

/** A pile of fakes around the real state and camera. A removal's board lands in `boards`, and what it draws logs 'removal'. */
function setup(onDraw: (board: Board, now: number) => void = () => {}) {
  const log: string[] = [];
  const boards: Board[] = [];
  const remover: Remover = {
    name: 'test',
    begin: (board) => {
      boards.push(board);
      return {
        isOver: () => false,
        draw: (_ctx, now) => (log.push('removal'), onDraw(board, now)),
      };
    },
  };
  const client = new FakeClient(log);
  const renderer = new FakeRenderer(log);
  const state = new PileState(PILE, { world, heapAgeMs: 100, releaseBand: 34, landedSpeed: 300 });
  const camera = new Camera({ radius: PILE.radius, headroom: PILE.headroom, height: world.height });
  camera.subscribe(() => log.push('camera'));
  const pile = new Pile({
    client,
    state,
    camera,
    renderer,
    removers: [remover],
    radius: PILE.radius,
  });
  const canvas = {} as HTMLCanvasElement;
  return { pile, client, renderer, state, camera, canvas, log, boards };
}

const scoopOf = (ids: number[], drop = 0): Scoop => ({
  ids: Int32Array.from(ids),
  xy: Float32Array.from(ids.flatMap((_, k) => [20 + 12 * k, 500])),
  drop,
});

describe('Pile frame', () => {
  it('steps the camera, then sends the drop line, draws the pile, then the removal, then the held icon, in that order', () => {
    // A removal under way holds the camera still, unless it asks to move it, as this one does.
    const { pile, client, canvas, log } = setup((board) => board.camera.moveTo(-100));
    pile.onFrame(frame({ scooped: [scoopOf([2])] }), 0);
    log.length = 0;
    pile.frame(canvas, 0);
    expect(log).toEqual(['dropLine', 'draw', 'removal', 'held']);
    log.length = 0;
    pile.frame(canvas, 16);
    expect(log).toEqual(['camera', 'dropLine', 'draw', 'removal', 'held']);
    // The line follows where the view is heading, which the camera knew before it drew.
    expect(client.dropLines).toEqual([-PILE.radius, -100 - PILE.radius]);
  });

  it('draws no removal when the renderer has nothing to draw on', () => {
    const { pile, renderer, canvas, log } = setup();
    renderer.draw = () => {
      log.push('draw');
      return null as never;
    };
    pile.onFrame(frame({ scooped: [scoopOf([1])] }), 0);
    log.length = 0;
    pile.frame(canvas, 0);
    expect(log).toEqual(['dropLine', 'draw']);
  });
});

describe('Pile drop line', () => {
  it('is sent from the camera target with an icon radius to spare, and only when it changes', () => {
    const { pile, client, canvas } = setup();
    pile.onFrame(frame({ settled: [[1, 100, 600]] }), 0);
    pile.frame(canvas, 0);
    pile.frame(canvas, 16);
    // A low pile: the view is at the floor.
    expect(client.dropLines).toEqual([-PILE.radius]);

    // The pile grows into the headroom: the line goes up with where the view is heading,
    // not with where it has got to so far.
    pile.onFrame(frame({ time: 16, settled: [[2, 100, -300]] }), 16);
    pile.frame(canvas, 32);
    pile.frame(canvas, 48);
    expect(client.dropLines).toEqual([-PILE.radius, Math.round(over(-300) - PILE.radius)]);
    expect(pile.view.top).toBeGreaterThan(over(-300));

    // It comes down with the pile.
    pile.onFrame(frame({ time: 32, woken: [2] }), 32);
    pile.frame(canvas, 64);
    expect(client.dropLines).toEqual([
      -PILE.radius,
      Math.round(over(-300) - PILE.radius),
      -PILE.radius,
    ]);
  });

  it('is not pushed up by the icons it has just let in, which would chase themselves up for ever', () => {
    const { pile, client, canvas } = setup();
    pile.onFrame(frame({ settled: [[1, 100, 600]] }), 0);
    pile.frame(canvas, 0);
    // A stream released at the line, a few frames apart, each falling into the view.
    for (let k = 1; k <= 6; k++) {
      const line = client.dropLines.at(-1)!;
      pile.onFrame(frame({ time: k * 16, moving: [[10 + k, 200, line + 5]] }), k * 16);
      pile.frame(canvas, k * 16);
    }
    expect(client.dropLines).toEqual([-PILE.radius]);
  });

  it('is sent again after the engine starts over, since it has forgotten it', () => {
    const { pile, client, canvas } = setup();
    pile.onFrame(frame({}), 0);
    pile.frame(canvas, 0);
    pile.onFrame(frame({ generation: 1 }), 16);
    pile.frame(canvas, 16);
    expect(client.dropLines).toEqual([-PILE.radius, -PILE.radius]);
  });
});

describe('Pile generations', () => {
  it('lets go of the removals and the view before taking in the new frame, so nothing waits on a removal that is gone', () => {
    const { pile, client, camera, state, canvas } = setup((board) => board.camera.moveTo(-500));
    pile.onFrame(frame({ scooped: [scoopOf([1, 2])] }), 0);
    for (let now = 0; now < 4000; now += 16) pile.frame(canvas, now);
    expect(camera.view.top).toBeCloseTo(-500, 0);
    // A removal is on, so an addition waits for it.
    pile.add(5, 4000);
    expect(client.added).toEqual([]);

    const seen: (number | undefined)[] = [];
    camera.subscribe((top) => seen.push(top, state.slotOf(7)));
    pile.onFrame(frame({ generation: 1, settled: [[7, 50, 50]] }), 4000);
    // The view went to the floor before the frame's icon was taken in.
    expect(seen).toEqual([0, undefined]);
    expect(state.slotOf(7)).toBe(0);
    expect(camera.view.top).toBe(0);
    // The queue went too: the removal is not holding up what comes next.
    pile.add(3, 4001);
    expect(client.added).toEqual([3]);
  });
});

describe('Pile routing for removals', () => {
  it('answers a removal from the state, takes its icons off the renderer, stamps on the frame, and moves the camera', () => {
    const { pile, renderer, camera, canvas, boards } = setup((board) => {
      board.stamp(7, 8, 2);
      board.camera.moveTo(-200);
    });
    pile.onFrame(
      frame({
        settled: [
          [1, 100, 600],
          [2, 140, 600],
          [3, 180, 600],
        ],
        moving: [[4, 300, 100]],
        scooped: [scoopOf([1, 4])],
      }),
      0,
    );
    const board = boards[0]!;
    expect(board.iconRadius).toBe(PILE.radius);
    expect(board.where(0)).toEqual({ x: 100, y: 600 });
    expect(board.where(1)).toEqual({ x: 300, y: 100 });
    expect(board.topAt(300)).toBe(100);
    expect(board.topAt(30)).toBeNull();

    // Taking the resting one takes it off the layer: the renderer is told as it happens.
    expect(board.take(0)).toMatchObject({ x: 100, y: 600 });
    expect(renderer.removals).toEqual([[0, 2, 3, 100, 600]]);
    expect(board.take(1)).toMatchObject({ x: 300, y: 100 });
    expect(renderer.removals).toHaveLength(1);

    // What it stamps goes on the frame's canvas, and what it asks of the camera is done once it can.
    expect(renderer.stamps).toEqual([]);
    pile.frame(canvas, 0);
    expect(renderer.stamps).toHaveLength(1);
    expect(renderer.stamps[0]![0]).toBe(renderer.ctx);
    expect(renderer.stamps[0]!.slice(1)).toEqual([7, 8, 2]);
    for (let now = 16; now < 4000; now += 16) pile.frame(canvas, now);
    expect(camera.view.top).toBeCloseTo(-200, 0);
    expect(board.camera.view.top).toBeCloseTo(-200, 0);
    // Not a stamp outside a frame.
    const stamped = renderer.stamps.length;
    board.stamp(1, 1);
    expect(renderer.stamps).toHaveLength(stamped);
  });

  it("keeps a removal's icons from the user, and hands the user the rest", () => {
    const { pile } = setup();
    pile.onFrame(
      frame({
        settled: [
          [1, 100, 600],
          [2, 140, 600],
        ],
        scooped: [scoopOf([1])],
      }),
      0,
    );
    expect(pile.iconAt(100, 600)).toBeNull();
    expect(pile.iconAt(140, 600)).toBe(2);
  });
});

describe('Pile held icon and world', () => {
  it("sends the engine the user's grab, release and drop, and has the renderer draw the icon in hand", () => {
    const { pile, client, renderer } = setup();
    pile.grab(5, 10, 20);
    pile.move(5, 30, 40);
    pile.release(5, 30, 40);
    pile.grab(6, 1, 2);
    pile.destroy(6);
    expect(client.held).toEqual(['grab:5', 'release:5@30,40', 'grab:6', 'destroy:6']);
    expect(renderer.holds).toEqual([
      { id: 5, x: 10, y: 20 },
      { id: 5, x: 30, y: 40 },
      null,
      { id: 6, x: 1, y: 2 },
      null,
    ]);
  });

  it('turns a place on the canvas into a place in the world by where the view is', () => {
    const { pile, canvas } = setup();
    pile.onFrame(frame({ settled: [[1, 100, -300]] }), 0);
    expect(pile.toWorld(50, 80)).toEqual({ x: 50, y: 80 });
    for (let now = 0; now < 4000; now += 16) pile.frame(canvas, now);
    expect(pile.toWorld(50, 80).y).toBeCloseTo(80 + over(-300), 0);
  });

  it('counts the icons waiting on a removal with those the engine has yet to release', () => {
    const { pile, client } = setup();
    client.stats = { total: 40, moving: 3, queued: 5 };
    expect(pile.counts()).toEqual({ total: 40, moving: 3, queued: 5 });
    pile.remove(10, 0);
    pile.add(7, 0);
    expect(pile.counts()).toEqual({ total: 40, moving: 3, queued: 12 });
  });
});
