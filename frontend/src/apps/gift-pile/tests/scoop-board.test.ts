/** @jest-environment node */
import type { Hooks } from '../render/overlay';
import { ScoopBoard } from '../removal/scoop-board';
import type { RemovalSink } from '../removal/sink';

/** Logs what the board asks of the engine, as `verb:id`. */
const fakeSink = (log: string[]): RemovalSink => ({
  alive: () => 0,
  add: () => {},
  scoop: () => {},
  remove: () => {},
  grab: (id) => log.push(`grab:${id}`),
  release: (id, x, y) => log.push(`release:${id}@${x},${y}`),
  destroy: (id) => log.push(`destroy:${id}`),
});

/** The renderer, with every icon where it was scooped. */
const hooks: Hooks = {
  radius: 8,
  stamp: () => {},
  take: (id) => ({ x: id, y: 0 }),
  peek: (id) => ({ x: id, y: 0, resting: true }),
};

const scoop = {
  ids: Int32Array.from([10, 11, 12, 13]),
  xy: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
  drop: 1,
};

describe('ScoopBoard', () => {
  it('grabs an icon before anything else happens to it, and destroys all it did not drop when finished', () => {
    const log: string[] = [];
    const dropped: number[] = [];
    const board = new ScoopBoard(fakeSink(log), scoop, { width: 100, height: 100 }, (id) =>
      dropped.push(id),
    );
    board.frame(hooks);
    expect(board.icons[1]).toEqual({ x: 3, y: 4 });
    expect(board.dropCount).toBe(1);

    expect(board.take(0)).toEqual({ x: 10, y: 0 });
    expect(board.take(0)).toBeNull();
    board.drop(1, 50, 20);
    board.destroy(2);
    expect(dropped).toEqual([11]);
    expect(board.where(1)).toBeNull();
    expect([10, 11, 12, 13].map((id) => board.holds(id))).toEqual([true, false, false, true]);

    // The one never reached is grabbed and destroyed with the one taken; the others are left be.
    log.length = 0;
    board.finish();
    expect(log).toEqual(['destroy:10', 'grab:13', 'destroy:13']);
    expect(board.holds(13)).toBe(false);
  });
});
