import type { RateLimit } from './types';

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * At least `ms` between one request and the next, even when they are asked for at once: NetEase
 * is unofficial, so the search stays polite.
 */
export function minGap(
  ms: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = sleepFor,
): RateLimit {
  let next = 0;
  return async () => {
    const start = Math.max(now(), next);
    next = start + ms;
    const wait = start - now();
    if (wait > 0) await sleep(wait);
  };
}

/**
 * Stops asking a service that keeps failing: after `failures` in a row it stays open for
 * `offMs`, so a down NetEase costs nothing and the caller goes straight to its fallback.
 */
export class CircuitBreaker {
  private failed = 0;
  private openedAt: number | null = null;
  private readonly failures: number;
  private readonly offMs: number;
  private readonly now: () => number;

  constructor(options: { failures: number; offMs: number; now?: () => number }) {
    this.failures = options.failures;
    this.offMs = options.offMs;
    this.now = options.now ?? Date.now;
  }

  /** True while requests should not be made. Closes again once `offMs` has passed. */
  open(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt < this.offMs) return true;
    this.openedAt = null;
    this.failed = 0;
    return false;
  }

  success(): void {
    this.failed = 0;
  }

  failure(): void {
    this.failed += 1;
    if (this.failed >= this.failures) this.openedAt = this.now();
  }
}
