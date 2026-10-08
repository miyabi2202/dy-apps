import { PILE } from '../core/config';
import { PileState, REMOVED_STRIDE } from '../render/pile-state';
import { frame, mulberry32 } from './helpers';

/** A state that counts a moving icon as part of the heap after 100 ms, or once it has slowed below the stream's reach. */
const newState = () =>
  new PileState(PILE, { world: PILE.world, heapAgeMs: 100, releaseBand: 34, landedSpeed: 300 });

describe('PileState resting set', () => {
  it('keeps every resting icon at its slot through random settling and waking, and says what left', () => {
    const state = newState();
    const rng = mulberry32(11);
    const resting = new Map<number, [number, number]>();
    let next = 0;
    for (let step = 0; step < 300; step++) {
      const settled: [number, number, number][] = [];
      const woken: number[] = [];
      for (let k = Math.floor(rng() * 4); k > 0; k--) {
        const at: [number, number] = [Math.floor(rng() * 40) * 10, Math.floor(rng() * 20) * 10];
        settled.push([next, ...at]);
        resting.set(next++, at);
      }
      const ids = [...resting.keys()];
      for (let k = Math.floor(rng() * 3); k > 0 && ids.length; k--) {
        const id = ids.splice(Math.floor(rng() * ids.length), 1)[0]!;
        woken.push(id);
        resting.delete(id);
      }
      state.apply(frame({ settled, woken }), step);
      // Each removal in the journal names a slot of the set as it was then; replaying them over
      // a copy of the settled ones gives the set as it is now.
      expect(state.restingCount).toBe(resting.size);
      for (const [id, [x, y]] of resting) {
        const slot = state.slotOf(id)!;
        expect(slot).toBeLessThan(state.restingCount);
        expect([state.restingXy[2 * slot], state.restingXy[2 * slot + 1]]).toEqual([x, y]);
      }
      state.journal.clear();
    }
  });

  it('journals a removal as the slot it left, the last slot then, who filled it and where it was', () => {
    const state = newState();
    state.apply(
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
    expect(state.journal.removed).toEqual([]);
    state.apply(frame({ woken: [2, 4] }), 1);
    // 2 leaves slot 1, filled by 4 from slot 3; then 4 leaves slot 1, filled by 3 from slot 2.
    expect(state.journal.removed).toEqual([1, 3, 4, 30, 10, 1, 2, 3, 70, 10]);
    expect(state.journal.removed).toHaveLength(2 * REMOVED_STRIDE);
    expect(state.slotOf(4)).toBeUndefined();
    expect(state.slotOf(3)).toBe(1);
    // An icon that settled and woke within the frame is journalled too, since it was in the set between.
    state.journal.clear();
    state.apply(frame({ settled: [[5, 90, 10]], woken: [5, 99] }), 2);
    expect(state.journal.removed).toEqual([2, 2, -1, 90, 10]);
  });

  it('starts over on a new generation, forgetting the journal before it', () => {
    const state = newState();
    state.apply(frame({ settled: [[1, 10, 10]] }), 0);
    state.apply(frame({ woken: [1] }), 1);
    const again = frame({ generation: 1, settled: [[7, 50, 50]] });
    expect(state.isNewGeneration(again)).toBe(true);
    state.apply(again, 2);
    expect(state.isNewGeneration(again)).toBe(false);
    expect(state.journal.reset).toBe(true);
    expect(state.journal.removed).toEqual([]);
    expect(state.restingCount).toBe(1);
    expect(state.slotOf(1)).toBeUndefined();
    expect(state.prev).toBeNull();
  });

  it('takes the world size from the frames', () => {
    const state = newState();
    state.apply(frame({ width: 300, height: 500 }), 0);
    expect(state.world).toEqual({ width: 300, height: 500 });
  });
});

describe('PileState peek and take', () => {
  it('says where an icon is, resting or moving, and takes a resting one out of the set', () => {
    const state = newState();
    state.apply(
      frame({
        settled: [
          [1, 10, 10],
          [2, 30, 10],
        ],
        moving: [[3, 50, 40]],
      }),
      0,
    );
    expect(state.peek(1)).toEqual({ x: 10, y: 10, resting: true });
    expect(state.peek(3)).toEqual({ x: 50, y: 40, resting: false });
    expect(state.peek(9)).toBeNull();

    expect(state.take(1)).toEqual({ x: 10, y: 10, resting: true });
    expect(state.take(3)).toEqual({ x: 50, y: 40, resting: false });
    expect(state.take(9)).toBeNull();
    expect(state.peek(1)).toBeNull();
    expect(state.peek(2)).toEqual({ x: 30, y: 10, resting: true });
    // Only the resting one left the set, and the journal says so.
    expect(state.journal.removed).toEqual([0, 1, 2, 10, 10]);
  });
});

describe('PileState pile top', () => {
  it('finds the highest icon near a point across, resting or moving, and none where there are none', () => {
    const state = newState();
    state.apply(
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
    expect(state.topAt(104)).toBe(590);
    expect(state.topAt(300)).toBe(500);
    expect(state.topAt(200)).toBeNull();
    // A frame with the moving one settled lower: the top follows.
    state.apply(frame({ settled: [[4, 300, 630]] }), 1);
    expect(state.topAt(300)).toBe(630);
  });

  it('gives the top of every column, two radii wide, left to right', () => {
    const state = newState();
    state.apply(
      frame({
        settled: [
          [1, 5, 600],
          [2, 20, 580],
          [3, 22, 590],
        ],
        moving: [[4, 29, 400]],
      }),
      0,
    );
    const profile = state.profile();
    expect(profile).toHaveLength(Math.ceil(PILE.world.width / (2 * PILE.radius)) + 2);
    // Columns are 24 wide: 5, 20 and 22 are in the first, and 29 in the next.
    expect([...profile.slice(0, 3)]).toEqual([580, 400, Infinity]);
    // The same array until the pile changes.
    expect(state.profile()).toBe(profile);
    state.apply(frame({}), 1);
    expect(state.profile()).not.toBe(profile);
  });

  it('knows the heap top: what rests and what has moved a while, not the stream just released', () => {
    const state = newState();
    expect(state.highestTop(null)).toBeNull();
    state.apply(frame({ time: 0, settled: [[1, 100, 600]], moving: [[2, 200, -400]] }), 0);
    // The one at -400 has only just begun to move.
    expect(state.highestTop(null)).toBe(600);
    state.apply(frame({ time: 50, moving: [[2, 200, -300]] }), 1);
    expect(state.highestTop(null)).toBe(600);
    // A hundred ms on, it is part of the heap.
    state.apply(frame({ time: 100, moving: [[2, 200, -200]] }), 2);
    expect(state.highestTop(null)).toBe(-200);
    // Woken, a resting icon starts again: it counts once it has moved a while.
    state.apply(frame({ time: 150, settled: [[3, 100, 500]], moving: [[2, 200, -100]] }), 3);
    expect(state.highestTop(null)).toBe(-100);
    state.apply(frame({ time: 160, woken: [3] }), 4);
    expect(state.highestTop(null)).toBe(600);
  });

  it('counts a young icon that has landed on the heap and is settling, but not the stream above it', () => {
    const state = newState();
    const line = -500;
    state.apply(
      frame({
        time: 0,
        settled: [[1, 100, 600]],
        moving: [
          [2, 200, 300],
          [3, 240, -480],
        ],
      }),
      0,
    );
    // Both are just born: nothing is known of how fast they go.
    expect(state.highestTop(line)).toBe(600);
    // 3 falls at stream speed from the line; 2 creeps on the heap, well below the line.
    state.apply(
      frame({
        time: 16,
        moving: [
          [2, 200, 299],
          [3, 240, -470],
        ],
      }),
      1,
    );
    expect(state.highestTop(line)).toBe(299);
    // A slow one in the release band itself is still the stream's.
    state.apply(
      frame({
        time: 32,
        moving: [
          [2, 200, 299],
          [3, 240, -470],
        ],
      }),
      2,
    );
    expect(state.highestTop(line)).toBe(299);
    expect(state.highestTop(-300)).toBe(299);
    expect(state.highestTop(400)).toBe(600);
  });

  it('works out the heap top again when the icon that held it leaves, and not otherwise', () => {
    const state = newState();
    state.apply(
      frame({
        settled: [
          [1, 100, 600],
          [2, 140, 300],
          [3, 180, 450],
        ],
      }),
      0,
    );
    expect(state.highestTop(null)).toBe(300);
    state.apply(frame({ woken: [3] }), 1);
    expect(state.highestTop(null)).toBe(300);
    state.take(2);
    expect(state.highestTop(null)).toBe(600);
    state.apply(frame({ woken: [1] }), 2);
    expect(state.highestTop(null)).toBeNull();
  });
});

describe('PileState iconAt', () => {
  it('picks the nearest icon within the grab radius, a moving one before a resting one, and not one it is told to skip', () => {
    const state = newState();
    state.apply(
      frame({
        settled: [
          [1, 100, 100],
          [2, 140, 100],
        ],
        moving: [[3, 104, 100]],
      }),
      0,
    );
    // Both are within reach of the press, but the moving one is on top.
    expect(state.iconAt(102, 100)).toBe(3);
    expect(state.iconAt(102, 100, (id) => id === 3)).toBe(1);
    expect(state.iconAt(140, 100 + PILE.grabRadius / 2)).toBe(2);
    expect(state.iconAt(200, 100)).toBeNull();
    // Taken out of the set, a resting icon can't be picked.
    state.take(1);
    expect(state.iconAt(98, 100, (id) => id === 3)).toBeNull();
  });
});
