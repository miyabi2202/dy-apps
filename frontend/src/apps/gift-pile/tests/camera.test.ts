import { PILE } from '../core/config';
import { topKeeping } from '../removal/board';
import { Camera, type CameraInput } from '../render/camera';
import { moveWithView } from '../ui/bin';

const H = PILE.world.height;
/** Where the view's top should be to keep the headroom clear over a pile topped at `top`. */
const over = (top: number) => top - PILE.radius - PILE.headroom * H;

const newCamera = () => new Camera({ radius: PILE.radius, headroom: PILE.headroom, height: H });

/** Step `camera` every 16 ms from `from` to `to`, as the page's loop would, with what is the same throughout. */
const run = (camera: Camera, from: number, to: number, input: Omit<CameraInput, 'now'>) => {
  for (let now = from; now <= to; now += 16) camera.step({ now, ...input });
};

describe('Camera following the pile', () => {
  it('stays at the floor for a low pile, follows one that grows into its headroom up, and back down', () => {
    const camera = newCamera();
    run(camera, 0, 2000, { top: 600, busy: false });
    expect(camera.view).toEqual({ top: 0, height: H });

    run(camera, 2000, 6000, { top: -300, busy: false });
    expect(camera.view.top).toBeCloseTo(over(-300), 0);

    // The high one goes: back down to the floor, and no further.
    run(camera, 6000, 10000, { top: 600, busy: false });
    expect(camera.view.top).toBe(0);
  });

  it('goes to the floor when there is no pile', () => {
    const camera = newCamera();
    run(camera, 0, 4000, { top: -300, busy: false });
    run(camera, 4000, 8000, { top: null, busy: false });
    expect(camera.view.top).toBe(0);
  });

  it('eases rather than jumping, and takes its height from the canvas', () => {
    const camera = newCamera();
    camera.step({ now: 0, top: 600, busy: false });
    // A step covers a part of the way, by how long since the last.
    camera.step({ now: 16, top: -300, busy: false });
    const first = camera.view.top;
    expect(first).toBeLessThan(0);
    expect(first).toBeGreaterThan(over(-300) / 2);
    camera.step({ now: 32, top: -300, busy: false });
    expect(camera.view.top).toBeLessThan(first);

    camera.setHeight(500);
    expect(camera.view.height).toBe(500);
    // A shorter view keeps less clear above the pile.
    run(camera, 32, 6000, { top: -300, busy: false });
    expect(camera.view.top).toBeCloseTo(-300 - PILE.radius - PILE.headroom * 500, 0);
  });

  it('says where it is heading before it gets there, and where it is when it holds still', () => {
    const camera = newCamera();
    camera.step({ now: 0, top: 600, busy: false });
    camera.step({ now: 16, top: -300, busy: false });
    expect(camera.target).toBeCloseTo(over(-300), 5);
    expect(camera.view.top).toBeGreaterThan(camera.target);

    camera.step({ now: 32, top: -300, busy: true });
    expect(camera.target).toBe(camera.view.top);
  });
});

describe('Camera in a removal', () => {
  it('holds still while one is busy, and moves on once it is not', () => {
    const camera = newCamera();
    run(camera, 0, 3000, { top: -300, busy: true });
    expect(camera.view.top).toBe(0);
    run(camera, 3000, 7000, { top: -300, busy: false });
    expect(camera.view.top).toBeCloseTo(over(-300), 0);
  });

  it('goes where a busy removal asks, never below the floor, and back to following the pile after', () => {
    const camera = newCamera();
    camera.moveTo(-500);
    run(camera, 0, 4000, { top: 600, busy: true });
    expect(camera.view.top).toBeCloseTo(-500, 0);
    camera.moveTo(300);
    run(camera, 4000, 8000, { top: 600, busy: true });
    expect(camera.view.top).toBe(0);

    // Done: it follows the pile again, which is low, and an old request is forgotten.
    camera.moveTo(-500);
    run(camera, 8000, 12000, { top: 600, busy: false });
    expect(camera.view.top).toBe(0);
    run(camera, 12000, 16000, { top: 600, busy: true });
    expect(camera.view.top).toBe(0);
  });
});

describe('Camera watchers', () => {
  it('tells its watchers each time it moves, and stops when they leave', () => {
    const camera = newCamera();
    const seen: number[] = [];
    const stop = camera.subscribe((top) => seen.push(top));
    // A first step has nothing to ease from and goes straight to its target, so start from the floor.
    camera.step({ now: 0, top: 600, busy: false });
    run(camera, 16, 4000, { top: -300, busy: false });
    expect(seen.length).toBeGreaterThan(1);
    // Easing up, never past where it ends.
    for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeLessThanOrEqual(seen[k - 1]!);
    expect(seen[seen.length - 1]).toBe(camera.view.top);
    const count = seen.length;
    // Holding still says nothing.
    run(camera, 4000, 6000, { top: -300, busy: false });
    expect(seen).toHaveLength(count);

    stop();
    run(camera, 6000, 10000, { top: 600, busy: false });
    expect(camera.view.top).toBe(0);
    expect(seen).toHaveLength(count);
  });

  it('is back at the floor at once on a reset, which its watchers hear, with nothing asked of it', () => {
    const camera = newCamera();
    const seen: number[] = [];
    camera.subscribe((top) => seen.push(top));
    camera.moveTo(-500);
    run(camera, 0, 3000, { top: 600, busy: true });
    camera.reset();
    expect(camera.view.top).toBe(0);
    expect(seen[seen.length - 1]).toBe(0);
    // The request went with it: held still, it stays.
    run(camera, 3000, 5000, { top: 600, busy: true });
    expect(camera.view.top).toBe(0);
  });
});

describe('topKeeping', () => {
  const view = { top: -200, height: 100 };

  it('leaves the view where it is for a point already on screen, margins and all', () => {
    expect(topKeeping(view, -150, 10)).toBe(-200);
    // Exactly at either margin still counts as on screen.
    expect(topKeeping(view, -190, 10)).toBe(-200);
    expect(topKeeping(view, -110, 10)).toBe(-200);
  });

  it('moves the view just far enough for a point below it, or above it, to sit at the margin', () => {
    expect(topKeeping(view, -50, 10)).toBe(-140);
    expect(topKeeping(view, -250, 10)).toBe(-260);
  });
});

describe('moveWithView', () => {
  // A stage 700 CSS px tall over a canvas 700 world px tall: the bin's half is 25 px, about 0.036 of it.
  const place = { fx: 0.8, fy: 0.5 };
  const margin = 25 / 700;

  it('moves the bin with the world: down the stage as the view goes up, and up as it comes down', () => {
    expect(moveWithView(place, -70, 700, 700).fy).toBeCloseTo(0.6);
    expect(moveWithView(place, 70, 700, 700).fy).toBeCloseTo(0.4);
    expect(moveWithView(place, -70, 700, 700).fx).toBe(0.8);
  });

  it('keeps the bin all on the stage however far the view goes, so it can still be dragged', () => {
    expect(moveWithView(place, -5000, 700, 700).fy).toBeCloseTo(1 - margin);
    expect(moveWithView(place, 5000, 700, 700).fy).toBeCloseTo(margin);
  });

  it('gives back the same place when the bin stays put, so nothing re-renders for it', () => {
    expect(moveWithView(place, 0, 700, 700)).toBe(place);
    const atBottom = { fx: 0.8, fy: 1 - margin };
    expect(moveWithView(atBottom, -100, 700, 700)).toBe(atBottom);
  });
});
