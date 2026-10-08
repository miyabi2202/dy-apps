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
 * and anything it shouldn't do (`problems`): touch an icon after it is dropped or gone, or
 * draw somewhere that isn't a number. Checking each call with `expect` would be thousands of
 * expects a frame, so they are gathered and checked once.
 */
function recordingBoard(n: number, dropCount: number) {
  const icons: Point[] = Array.from({ length: n }, (_, i) => ({
    x: 20 + ((i * 37) % 376),
    y: 500 - ((i * 13) % 60),
  }));
  const taken = new Set<number>();
  const dropped = new Set<number>();
  const destroyed = new Set<number>();
  const problems = new Set<string>();
  const done = (i: number) => dropped.has(i) || destroyed.has(i);
  const finite = (...values: number[]) => values.every(Number.isFinite);
  const board: Board = {
    world,
    iconRadius: 8,
    icons,
    dropCount,
    // The highest of the icons left near x, as the pile's top would be.
    topAt: (x) => {
      const near = icons.filter((p, i) => !done(i) && !taken.has(i) && Math.abs(p.x - x) < 16);
      return near.length > 0 ? Math.min(...near.map((p) => p.y)) : null;
    },
    where: (i) => (done(i) ? null : icons[i]!),
    take: (i) => {
      if (taken.has(i) || done(i)) return null;
      taken.add(i);
      return icons[i]!;
    },
    drop: (i, x, y, vx = 0, vy = 0) => {
      if (done(i)) problems.add('dropped an icon twice, or after destroying it');
      if (!finite(x, y, vx, vy)) problems.add('dropped an icon somewhere that is not a number');
      dropped.add(i);
    },
    destroy: (i) => {
      if (done(i)) problems.add('destroyed an icon twice, or after dropping it');
      destroyed.add(i);
    },
    stamp: (x, y, scale = 1) => {
      if (!finite(x, y, scale)) problems.add('drew an icon somewhere that is not a number');
    },
  };
  return { board, taken, dropped, destroyed, problems };
}

/** Runs a removal to its end, a frame every `frameMs`; fails if it goes on past five minutes. */
function runToEnd(
  removal: ReturnType<ReturnType<typeof allRemovers>[number]['begin']>,
  frameMs: number,
) {
  const ctx = fakeContext();
  let now = 0;
  for (; !removal.isOver(now); now += frameMs) {
    if (now > 300_000) throw new Error('the removal never ended');
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
  ])('with %i icons, drops exactly %i back and ends', (n, dropCount) => {
    const { board, dropped, problems } = recordingBoard(n, dropCount);
    const removal = remover.begin(board, 0, mulberry32(n));
    runToEnd(removal, 16);
    expect([...problems]).toEqual([]);
    expect(dropped.size).toBe(dropCount);
  });

  it('deals with every icon before the end (takes, drops or destroys it), rather than leaving it in the pile', () => {
    const { board, taken, dropped, destroyed } = recordingBoard(40, 8);
    runToEnd(remover.begin(board, 0, mulberry32(2)), 16);
    for (let i = 0; i < 40; i++) {
      expect(taken.has(i) || dropped.has(i) || destroyed.has(i)).toBe(true);
    }
  });

  it('still drops exactly its share when frames are few and far between (a hidden tab)', () => {
    const { board, dropped, problems } = recordingBoard(40, 8);
    runToEnd(remover.begin(board, 0, mulberry32(3)), 700);
    expect([...problems]).toEqual([]);
    expect(dropped.size).toBe(8);
  });
});
