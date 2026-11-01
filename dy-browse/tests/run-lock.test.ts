import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLockStore, pidAlive } from '../src/adapters/file-adapters';
import { RunLock, type LockInfo, type LockStore } from '../src/app/run-lock';
import { LockHeldError } from '../src/core/errors';

class MemoryLock implements LockStore {
  info: LockInfo | null = null;
  read = () => this.info;
  write = (info: LockInfo) => void (this.info = info);
  remove = () => void (this.info = null);
}

describe('RunLock', () => {
  it('writes the pid and start time, and removes them on release', () => {
    const store = new MemoryLock();
    const lock = new RunLock(store, { pid: 10, now: () => 5000, isAlive: () => true });
    lock.acquire();
    expect(store.info).toEqual({ pid: 10, startedAt: 5000 });
    lock.release();
    expect(store.info).toBeNull();
  });

  it('refuses while another live run holds it', () => {
    const store = new MemoryLock();
    store.info = { pid: 99, startedAt: 1 };
    const lock = new RunLock(store, { pid: 10, isAlive: (pid) => pid === 99 });
    expect(() => lock.acquire()).toThrow(LockHeldError);
    expect(store.info).toEqual({ pid: 99, startedAt: 1 });
    // A run that never got the lock doesn't remove the other's.
    lock.release();
    expect(store.info).toEqual({ pid: 99, startedAt: 1 });
  });

  it('takes over a stale lock, whose pid is dead', () => {
    const store = new MemoryLock();
    store.info = { pid: 99, startedAt: 1 };
    const lock = new RunLock(store, { pid: 10, now: () => 7, isAlive: () => false });
    lock.acquire();
    expect(store.info).toEqual({ pid: 10, startedAt: 7 });
  });
});

describe('FileLockStore', () => {
  it('round-trips, and a missing or broken file reads as no lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dy-browse-lock-'));
    try {
      const store = new FileLockStore(join(dir, 'data', 'browse.lock'));
      expect(store.read()).toBeNull();
      store.write({ pid: 3, startedAt: 4 });
      expect(store.read()).toEqual({ pid: 3, startedAt: 4 });
      store.remove();
      expect(existsSync(join(dir, 'data', 'browse.lock'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sees this process alive', () => {
    expect(pidAlive(process.pid)).toBe(true);
  });
});
