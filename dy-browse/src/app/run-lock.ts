import { LockHeldError } from '../core/errors';

export interface LockInfo {
  pid: number;
  startedAt: number;
}

/** Where the lock lives: `data/browse.lock` in production. */
export interface LockStore {
  read(): LockInfo | null;
  write(info: LockInfo): void;
  remove(): void;
}

export interface RunLockOptions {
  pid?: number;
  now?: () => number;
  /** Whether a process with this pid exists. */
  isAlive: (pid: number) => boolean;
}

/**
 * The lock a run holds from start to finish. A stale one, whose pid is dead (a crashed run), is
 * taken over; a live one means another run is going.
 */
export class RunLock {
  private readonly pid: number;
  private readonly now: () => number;
  private held = false;

  constructor(
    private readonly store: LockStore,
    private readonly options: RunLockOptions,
  ) {
    this.pid = options.pid ?? process.pid;
    this.now = options.now ?? Date.now;
  }

  acquire(): void {
    const existing = this.store.read();
    if (existing && existing.pid !== this.pid && this.options.isAlive(existing.pid)) {
      throw new LockHeldError(existing.pid, existing.startedAt);
    }
    this.store.write({ pid: this.pid, startedAt: this.now() });
    this.held = true;
  }

  /** Removes the lock, if this run holds it. */
  release(): void {
    if (!this.held) return;
    this.held = false;
    if (this.store.read()?.pid === this.pid) this.store.remove();
  }
}
