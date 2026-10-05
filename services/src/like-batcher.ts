/** Cancels what `schedule` set up. */
type Cancel = () => void;

export interface LikeBatcherOptions<T> {
  /** Called once a user has stopped liking for `quietMs`, with their last event and total. */
  onFlush: (last: T, total: number) => void;
  quietMs?: number;
  /** setTimeout by default; tests pass a fake clock. */
  schedule?: (run: () => void, ms: number) => Cancel;
}

const defaultSchedule = (run: () => void, ms: number): Cancel => {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
};

/**
 * Adds up each user's likes and reports them in one go once that user has been quiet
 * for 5 seconds. Douyin sends a like event every few taps, so a busy room would
 * otherwise bury the chat under one card per tap.
 */
export class LikeBatcher<T> {
  private readonly pending = new Map<string, { last: T; total: number; cancel: Cancel }>();
  private readonly onFlush: (last: T, total: number) => void;
  private readonly quietMs: number;
  private readonly schedule: (run: () => void, ms: number) => Cancel;

  constructor({ onFlush, quietMs = 5_000, schedule = defaultSchedule }: LikeBatcherOptions<T>) {
    this.onFlush = onFlush;
    this.quietMs = quietMs;
    this.schedule = schedule;
  }

  /** Counts `count` more likes from `userId`, restarting their quiet period. */
  add(userId: string, event: T, count: number): void {
    const previous = this.pending.get(userId);
    previous?.cancel();
    const total = (previous?.total ?? 0) + Math.max(1, count);
    const cancel = this.schedule(() => {
      this.pending.delete(userId);
      this.onFlush(event, total);
    }, this.quietMs);
    this.pending.set(userId, { last: event, total, cancel });
  }

  /** Drops every pending count without reporting it, e.g. on disconnect. */
  clear(): void {
    for (const { cancel } of this.pending.values()) cancel();
    this.pending.clear();
  }
}
