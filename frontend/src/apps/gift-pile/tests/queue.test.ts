/** @jest-environment node */
import { planRemoval, LOAD_CAPACITY } from '../removal/queue';

describe('planRemoval', () => {
  it('takes a quarter more than asked and drops back what is over, so the pile loses just the number', () => {
    expect(planRemoval(40, 400)).toEqual({ carry: 50, drop: 10, instant: 0 });
    expect(planRemoval(1, 400)).toEqual({ carry: 1, drop: 0, instant: 0 });
    expect(planRemoval(30, 400)).toEqual({ carry: 38, drop: 8, instant: 0 });
    // A pile between the number and a quarter more: all of it, what is over dropped back.
    expect(planRemoval(40, 45)).toEqual({ carry: 45, drop: 5, instant: 0 });
  });

  it('takes everything and drops nothing when the pile has no more than asked', () => {
    expect(planRemoval(40, 40)).toEqual({ carry: 40, drop: 0, instant: 0 });
    expect(planRemoval(40, 12)).toEqual({ carry: 12, drop: 0, instant: 0 });
    expect(planRemoval(40, 0)).toEqual({ carry: 0, drop: 0, instant: 0 });
    expect(planRemoval(0, 40)).toEqual({ carry: 0, drop: 0, instant: 0 });
  });

  it('carries off what one removal can and removes the rest at once', () => {
    expect(planRemoval(LOAD_CAPACITY + 400, 5000)).toEqual({
      carry: LOAD_CAPACITY,
      drop: 600,
      instant: 1000,
    });
    expect(planRemoval(LOAD_CAPACITY + 400, 2200)).toEqual({
      carry: LOAD_CAPACITY,
      drop: 0,
      instant: 200,
    });
  });
});
