/** @jest-environment node */
import { planRemoval, VACUUM_CAPACITY } from '../flights/queue';

describe('planRemoval', () => {
  it('takes a quarter more than asked and drops half of it, while the pile has more than asked', () => {
    expect(planRemoval(40, 400)).toEqual({ fly: 50, drop: 25, instant: 0 });
    expect(planRemoval(1, 400)).toEqual({ fly: 1, drop: 0, instant: 0 });
    expect(planRemoval(30, 400)).toEqual({ fly: 38, drop: 19, instant: 0 });
    // A pile between the number and a quarter more: all of it, half dropped.
    expect(planRemoval(40, 45)).toEqual({ fly: 45, drop: 22, instant: 0 });
  });

  it('takes everything and drops nothing when the pile has no more than asked', () => {
    expect(planRemoval(40, 40)).toEqual({ fly: 40, drop: 0, instant: 0 });
    expect(planRemoval(40, 12)).toEqual({ fly: 12, drop: 0, instant: 0 });
    expect(planRemoval(40, 0)).toEqual({ fly: 0, drop: 0, instant: 0 });
    expect(planRemoval(0, 40)).toEqual({ fly: 0, drop: 0, instant: 0 });
  });

  it('flies what one craft can carry and removes the rest at once', () => {
    expect(planRemoval(VACUUM_CAPACITY + 400, 5000)).toEqual({
      fly: VACUUM_CAPACITY,
      drop: 1500,
      instant: 1000,
    });
    expect(planRemoval(VACUUM_CAPACITY + 400, 2200)).toEqual({
      fly: VACUUM_CAPACITY,
      drop: 0,
      instant: 200,
    });
  });
});
