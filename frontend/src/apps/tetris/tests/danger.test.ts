import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { dangerLevel, Heartbeat } from '../core/danger';
import { boardWithRows } from './helpers';

const { rows } = CONFIG.board;
const { beatSlowMs, beatFastMs, fromHeight } = CONFIG.danger;
const from = Math.round(rows * fromHeight);

/** A board whose stack is `height` rows tall. */
const stackOf = (height: number) =>
  boardWithRows(
    Array.from({ length: height }, (_, i) => rows - 1 - i),
    [0],
  );

describe('dangerLevel', () => {
  it('is null below the danger height, then rises from 0 to 1 at the top', () => {
    expect(dangerLevel(createBoard())).toBeNull();
    expect(dangerLevel(stackOf(from - 1))).toBeNull();
    expect(dangerLevel(stackOf(from))).toBe(0);
    expect(dangerLevel(stackOf(rows))).toBe(1);
  });
});

describe('Heartbeat', () => {
  it('beats as danger starts, then every beatSlowMs, faster near the top, and stops out of danger', () => {
    const heart = new Heartbeat();
    expect(heart.advance(16, null)).toBe(false);
    expect(heart.advance(16, 0)).toBe(true);
    expect(heart.advance(beatSlowMs - 1, 0)).toBe(false);
    expect(heart.advance(1, 0)).toBe(true);
    expect(heart.advance(beatFastMs, 1)).toBe(true);
    expect(heart.advance(16, null)).toBe(false);
    // Back in danger: at once again.
    expect(heart.advance(16, 0.5)).toBe(true);
  });
});
