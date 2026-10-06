import { act, renderHook } from '@testing-library/react';
import { useDemo } from '../use-demo';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDemo', () => {
  it('without randomness, ticks at exactly the interval with a running count', () => {
    const tick = jest.fn();
    renderHook(() => useDemo(true, 1000, tick, null));
    act(() => jest.advanceTimersByTime(300)); // the first comes quickly
    expect(tick.mock.calls).toEqual([[0]]);
    act(() => jest.advanceTimersByTime(999));
    expect(tick).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1));
    act(() => jest.advanceTimersByTime(1000));
    expect(tick.mock.calls).toEqual([[0], [1], [2]]);
  });

  it('spaces ticks by the random source, from 0.3× to 1.7× the interval', () => {
    const tick = jest.fn();
    renderHook(() => useDemo(true, 1000, tick, () => 0));
    act(() => jest.advanceTimersByTime(300));
    act(() => jest.advanceTimersByTime(300));
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('keeps counting when the interval changes, and starts over when stopped', () => {
    const tick = jest.fn();
    const { rerender } = renderHook(({ running, ms }) => useDemo(running, ms, tick, null), {
      initialProps: { running: true, ms: 1000 },
    });
    act(() => jest.advanceTimersByTime(1300));
    rerender({ running: true, ms: 500 });
    act(() => jest.advanceTimersByTime(300));
    expect(tick.mock.calls).toEqual([[0], [1], [2]]);
    rerender({ running: false, ms: 500 });
    rerender({ running: true, ms: 500 });
    act(() => jest.advanceTimersByTime(300));
    expect(tick).toHaveBeenLastCalledWith(0);
  });
});
