import { useEffect, useRef } from 'react';

/**
 * While `running`, calls `tick` with a running count (0, 1, 2, …) at an interval averaging
 * `intervalMs`. The first comes quickly. With `random`, the gaps vary so fake messages arrive
 * unevenly like real ones; with `random: null` every gap is exactly `intervalMs`. The count
 * starts over when the demo stops, and carries on when only the interval changes.
 */
export function useDemo(
  running: boolean,
  intervalMs: number,
  tick: (n: number) => void,
  random: (() => number) | null = Math.random,
): void {
  const countRef = useRef(0);
  useEffect(() => {
    if (!running) {
      countRef.current = 0;
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        tick(countRef.current++);
        schedule(random ? intervalMs * (0.3 + random() * 1.4) : intervalMs);
      }, delay);
    };
    schedule(Math.min(intervalMs, 300));
    return () => clearTimeout(timer);
  }, [running, intervalMs, tick, random]);
}
