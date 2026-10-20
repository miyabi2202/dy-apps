/**
 * The work still running, so a test (or a shutdown) can wait for it: `track` what's started, and
 * `idle()` resolves once all of it has ended, failed or not, including what was started meanwhile.
 */
export class Pending {
  private readonly running = new Set<Promise<void>>();

  /** Keeps `work` until it ends; a failure is the caller's to handle, not idle()'s. */
  track(work: Promise<unknown>): void {
    const run: Promise<void> = work
      .then(
        () => {},
        () => {},
      )
      .then(() => void this.running.delete(run));
    this.running.add(run);
  }

  async idle(): Promise<void> {
    while (this.running.size) await Promise.all(this.running);
  }
}
