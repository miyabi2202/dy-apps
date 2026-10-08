/** @jest-environment node */
import type { Board, Point } from '../removal/board';
import { allRemovers } from '../removal/removers';
import { mulberry32 } from './helpers';

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

/**
 * A board of `n` icons along the top of a pile, recording what the removal does with each
 * and failing on anything it shouldn't: touching an icon after it is dropped or gone, or
 * drawing somewhere that isn't a number.
 */
function recordingBoard(n: number, dropCount: number) {
  const icons: Point[] = Array.from({ length: n }, (_, i) => ({
    x: 20 + ((i * 37) % 376),
    y: 500 - ((i * 13) % 60),
  }));
  const taken = new Set<number>();
  const dropped = new Set<number>();
  const destroyed = new Set<number>();
  const done = (i: number) => dropped.has(i) || destroyed.has(i);
  const board: Board = {
    world,
    iconRadius: 8,
    icons,
    dropCount,
    where: (i) => (done(i) ? null : icons[i]!),
    take: (i) => {
      if (taken.has(i) || done(i)) return null;
      taken.add(i);
      return icons[i]!;
    },
    drop: (i, x, y) => {
      expect(done(i)).toBe(false);
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      dropped.add(i);
    },
    destroy: (i) => {
      expect(done(i)).toBe(false);
      destroyed.add(i);
    },
    stamp: (x, y, scale = 1) => {
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(scale)).toBe(true);
    },
  };
  return { board, taken, dropped, destroyed };
}

/** Runs a removal to its end, a frame every `frameMs`; fails if it goes on past a minute. */
function runToEnd(
  removal: ReturnType<ReturnType<typeof allRemovers>[number]['begin']>,
  frameMs: number,
) {
  const ctx = fakeContext();
  let now = 0;
  for (; !removal.isOver(now); now += frameMs) {
    if (now > 60_000) throw new Error('the removal never ended');
    removal.draw(ctx, now);
  }
  return now;
}

describe.each(allRemovers().map((r) => [r.name, r] as const))('remover %s', (_, remover) => {
  it.each([
    [1, 0],
    [2, 1],
    [40, 8],
    [2000, 400],
  ])('with %i icons, drops exactly %i back and ends in a fair time', (n, dropCount) => {
    const { board, dropped } = recordingBoard(n, dropCount);
    const removal = remover.begin(board, 0, mulberry32(n));
    const took = runToEnd(removal, 16);
    expect(dropped.size).toBe(dropCount);
    expect(took).toBeLessThan(15_000);
  });

  it('takes every icon it carries off before the end, rather than leaving them in the pile', () => {
    const { board, taken, dropped } = recordingBoard(40, 8);
    runToEnd(remover.begin(board, 0, mulberry32(2)), 16);
    for (let i = 0; i < 40; i++) if (!dropped.has(i)) expect(taken.has(i)).toBe(true);
  });

  it('still drops exactly its share when frames are few and far between (a hidden tab)', () => {
    const { board, dropped } = recordingBoard(40, 8);
    runToEnd(remover.begin(board, 0, mulberry32(3)), 700);
    expect(dropped.size).toBe(8);
  });
});
