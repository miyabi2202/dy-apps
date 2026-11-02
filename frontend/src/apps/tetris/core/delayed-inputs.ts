/**
 * The player's commands waiting out a delay (延迟), oldest first, each with when it acts. A
 * command running from here is not delayed again.
 */
export class DelayedInputs {
  private queue: { atMs: number; run: () => void }[] = [];
  private running = false;

  /** Queues `run` for `atMs`; false while a queued command is the one running, so it acts now. */
  defer(run: () => void, atMs: number): boolean {
    if (this.running) return false;
    this.queue.push({ atMs, run });
    return true;
  }

  /** Runs the commands whose time has come, in the order they were given. */
  runDue(nowMs: number): void {
    while (this.queue.length > 0 && this.queue[0]!.atMs <= nowMs) {
      const { run } = this.queue.shift()!;
      this.running = true;
      try {
        run();
      } finally {
        this.running = false;
      }
    }
  }

  clear(): void {
    this.queue = [];
  }
}
