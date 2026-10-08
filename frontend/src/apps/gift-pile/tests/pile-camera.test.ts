/** @jest-environment node */
import { PILE } from '../core/config';
import type { PileEngine } from '../core/engine';
import { frameOf } from '../core/frame';
import { Pile, type PileDrawing, type PileLink } from '../pile';
import { Camera } from '../render/camera';
import { PileState, pileStateOptions } from '../render/pile-state';
import { createEngine, restingIcons } from './engine-helpers';

// The real engine, state, camera and pile together, as the page has them, with no worker or
// canvas: frames go from the engine to the pile each tick, and the pile's drop line back to
// the engine, so how the camera follows a pile that grows and shrinks can be watched.

/** The engine, as the pile's client: what the pile tells the worker goes straight to it. */
function linkTo(engine: PileEngine): PileLink {
  return {
    start: () => {},
    stop: () => {},
    stats: { total: 0, moving: 0, queued: 0 },
    error: null,
    alive: () => engine.alive,
    add: (count) => void engine.add(count),
    remove: (count) => void engine.remove(count),
    scoop: () => {},
    clear: () => engine.clear(),
    resize: () => {},
    grab: (id) => engine.grab(id),
    release: (id, x, y) => engine.release(id, x, y),
    destroy: (id) => engine.destroy(id),
    setDropLine: (line) => engine.setDropLine(line),
  };
}

/** A renderer with nowhere to draw: the pile still steps its camera and sends its drop line. */
const noDrawing: PileDrawing = {
  apply: (journal) => journal.clear(),
  draw: () => null,
  drawHeld: () => {},
  hold: () => {},
  stamp: () => {},
  setImage: () => {},
};

async function setup() {
  const engine = await createEngine();
  const world = { width: engine.width, height: engine.height };
  const state = new PileState(PILE, pileStateOptions(PILE, world));
  const camera = new Camera({ radius: PILE.radius, headroom: PILE.headroom, height: world.height });
  const pile = new Pile({
    client: linkTo(engine),
    state,
    camera,
    renderer: noDrawing,
    removers: [{ name: 'none', begin: () => ({ isOver: () => true, draw: () => {} }) }],
    radius: PILE.radius,
  });
  const canvas = {} as HTMLCanvasElement;
  let time = 0;
  /** Where following the pile as it really rests would put the view's top. */
  const following = () => {
    const ys = restingIcons(engine).map((i) => engine.y[i]!);
    if (ys.length === 0) return 0;
    return Math.min(0, Math.min(...ys) - PILE.radius - PILE.headroom * world.height);
  };
  /**
   * Run `seconds` of ticks, a frame to the pile and a display frame each. Returns how far,
   * at most, the view got ahead of (above) where following the resting pile would put it.
   */
  const run = (seconds: number): number => {
    let ahead = 0;
    for (let k = 0; k < seconds * PILE.stepHz; k++) {
      engine.step();
      time += 1000 / PILE.stepHz;
      pile.onFrame(frameOf(engine, time, []), time);
      pile.frame(canvas, time);
      ahead = Math.max(ahead, following() - camera.view.top);
    }
    return ahead;
  };
  return { engine, camera, run };
}

/**
 * How far ahead of the resting pile the view may get, for the icons that have landed on it
 * but not yet come to rest, which it counts: a few rows of icons.
 */
const SLACK = 80;

describe('the camera on a real pile', () => {
  it('moves on up as a second batch tops the first, never ahead of the pile', async () => {
    const { engine, camera, run } = await setup();
    engine.add(700);
    expect(run(10)).toBeLessThan(SLACK);
    const first = camera.view.top;
    expect(first).toBeLessThan(0);
    engine.add(700);
    expect(run(12)).toBeLessThan(SLACK);
    expect(camera.view.top).toBeLessThan(first);
  });

  it('comes back down after a removal, and goes up again with what is added, never ahead of the pile', async () => {
    const { engine, camera, run } = await setup();
    // Enough taken away that the pile's top drops far, and the stream added back would fall a
    // long way if it were released from where the top used to be.
    engine.add(2400);
    run(16);
    const tall = camera.view.top;
    engine.remove(1400);
    run(6);
    const lower = camera.view.top;
    expect(lower).toBeGreaterThan(tall + 600);
    // Added back: up again with the pile as it grows, never running ahead of it.
    engine.add(1400);
    expect(run(14)).toBeLessThan(SLACK);
    expect(camera.view.top).toBeLessThan(lower);
  });
});
