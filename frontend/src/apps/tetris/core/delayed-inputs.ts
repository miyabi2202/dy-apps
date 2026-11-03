/**
 * The player's commands waiting out a delay (延迟), each with when it acts, soonest first: one
 * given later can act first. A command running from here is not delayed again.
 */
export class DelayedInputs {
  private queue: { atMs: number; run: () => void }[] = [];
  private runningNow = false;

  /** Whether a queued command is the one running now: it acts at once, not delayed again. */
  get running(): boolean {
    return this.runningNow;
  }

  /** Queues `run` for `atMs`; false while a queued command is the one running, so it acts now. */
  defer(run: () => void, atMs: number): boolean {
    if (this.runningNow) return false;
    // After any due at the same time, so those keep the order they were given in.
    const at = this.queue.findIndex((queued) => queued.atMs > atMs);
    this.queue.splice(at === -1 ? this.queue.length : at, 0, { atMs, run });
    return true;
  }

  /** Runs the commands whose time has come, soonest first. */
  runDue(nowMs: number): void {
    while (this.queue.length > 0 && this.queue[0]!.atMs <= nowMs) {
      const { run } = this.queue.shift()!;
      this.runningNow = true;
      try {
        run();
      } finally {
        this.runningNow = false;
      }
    }
  }

  /** Drops every command still waiting. */
  clear(): void {
    this.queue = [];
  }
}
