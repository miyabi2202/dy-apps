import { useEffect } from 'react';

/**
 * While `running`, calls `tick` at a jittered interval averaging `intervalMs`, so fake
 * messages arrive unevenly like real ones. The first comes quickly.
 */
export function useDemo(
  running: boolean,
  intervalMs: number,
  tick: () => void,
  random: () => number = Math.random,
): void {
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        tick();
        schedule(intervalMs * (0.3 + random() * 1.4));
      }, delay);
    };
    schedule(Math.min(intervalMs, 300));
    return () => clearTimeout(timer);
  }, [running, intervalMs, tick, random]);
}
