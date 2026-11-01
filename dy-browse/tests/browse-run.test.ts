import { BrowseRun, type Step } from '../src/app/browse-run';
import { LazyItemReader } from '../src/app/lazy-reader';
import { RunLock, type LockInfo, type LockStore } from '../src/app/run-lock';
import { StreamGuard } from '../src/app/stream-guard';
import { BlockedError, EmptyReadError, StreamStartedError } from '../src/core/errors';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

class MemoryLock implements LockStore {
  info: LockInfo | null = null;
  read = () => this.info;
  write = (info: LockInfo) => void (this.info = info);
  remove = () => void (this.info = null);
}

function setup({
  listening = new Set<number>(),
  steps = [] as Step[],
  heldBy = null as number | null,
} = {}) {
  const events: string[] = [];
  const store = new MemoryLock();
  if (heldBy) store.info = { pid: heldBy, startedAt: 1 };
  const lock = new RunLock(store, { pid: 7, isAlive: () => true });
  const data = new MemoryStore();
  const logs: string[] = [];
  const run = new BrowseRun({
    guard: new StreamGuard((port) => Promise.resolve(listening.has(port))),
    lock,
    data,
    log: (m) => logs.push(m),
    steps,
    cleanup: () => Promise.resolve(void events.push('cleanup')),
    now: () => Date.UTC(2026, 10, 1, 12),
  });
  return { run, events, store, data, logs, listening };
}

const step = (name: string, events: string[], act: () => void = () => {}): Step => ({
  name,
  run: () => {
    events.push(name);
    act();
    return Promise.resolve();
  },
});

describe('BrowseRun', () => {
  it('holds the lock for the whole run, does the steps in order, and lets go at the end', async () => {
    const events: string[] = [];
    let held: LockInfo | null = null;
    const store = new MemoryLock();
    const outcome = await new BrowseRun({
      guard: new StreamGuard(() => Promise.resolve(false)),
      lock: new RunLock(store, { pid: 7, isAlive: () => true }),
      data: new MemoryStore(),
      log: () => {},
      // The lock is there while a step runs.
      steps: [step('a', events, () => (held = store.info)), step('b', events)],
    }).run();
    expect(outcome).toEqual({ code: 0, done: ['a', 'b'], stopped: null });
    expect(events).toEqual(['a', 'b']);
    expect(held).toMatchObject({ pid: 7 });
    expect(store.info).toBeNull();
  });

  it.each([8757, 8758])(
    'refuses to start while port %i listens: no lock, no steps, no cleanup',
    async (port) => {
      const events: string[] = [];
      const { run, store, logs } = setup({
        listening: new Set([port]),
        steps: [step('a', events)],
      });
      const outcome = await run.run();
      expect(outcome.code).toBe(1);
      expect(events).toEqual([]);
      expect(store.info).toBeNull();
      expect(logs[0]).toContain(String(port));
    },
  );

  it('refuses while another run holds the lock, and leaves its lock alone', async () => {
    const events: string[] = [];
    const { run, store } = setup({ heldBy: 99, steps: [step('a', events)] });
    expect((await run.run()).code).toBe(1);
    expect(events).toEqual([]);
    expect(store.info).toEqual({ pid: 99, startedAt: 1 });
  });

  it('stops cleanly when a stream starts mid-run: exit 0, later steps not run, lock released', async () => {
    const events: string[] = [];
    const { run, store } = setup({
      steps: [
        step('a', events),
        { name: 'b', run: () => Promise.reject(new StreamStartedError(8758)) },
        step('c', events),
      ],
    });
    const outcome = await run.run();
    expect(outcome).toMatchObject({ code: 0, done: ['a'] });
    expect(outcome.stopped).toContain('8758');
    expect(events).toEqual(['a']);
    expect(store.info).toBeNull();
  });

  it('stops at the first captcha or login wall with its message, and does nothing more', async () => {
    const events: string[] = [];
    const {
      run,
      logs,
      events: ev,
    } = setup({
      steps: [
        { name: 'a', run: () => Promise.reject(new BlockedError('captcha')) },
        step('b', events),
      ],
    });
    const outcome = await run.run();
    expect(outcome.code).toBe(1);
    expect(outcome.stopped).toContain('验证码');
    expect(events).toEqual([]);
    expect(logs.at(-1)).toContain('验证码');
    expect(ev).toEqual(['cleanup']);
  });

  it('saves the raw bodies of a reader that got nothing, to screenshots/, and stops loudly', async () => {
    const { run, data, logs } = setup({
      steps: [
        {
          name: 'a',
          run: () => Promise.reject(new EmptyReadError('作品', ['{"odd":1}', '{"odd":2}'])),
        },
      ],
    });
    const outcome = await run.run();
    expect(outcome.code).toBe(1);
    const saved = data.list('screenshots');
    expect(saved).toEqual([
      'screenshots/2026-11-01T12-00-00-000Z-作品-1.txt',
      'screenshots/2026-11-01T12-00-00-000Z-作品-2.txt',
    ]);
    expect(data.read(saved[0]!)).toBe('{"odd":1}');
    expect(logs.join('\n')).toContain('原始响应已保存');
  });

  it('says so in the saved file when nothing came in at all', async () => {
    const { run, data } = setup({
      steps: [{ name: 'a', run: () => Promise.reject(new EmptyReadError('推荐视频', [])) }],
    });
    await run.run();
    expect(data.read(data.list('screenshots')[0]!)).toContain('没有收到任何响应');
  });

  it('lets an unexpected error through, after cleaning up and releasing the lock', async () => {
    const { run, events, store } = setup({
      steps: [{ name: 'a', run: () => Promise.reject(new Error('boom')) }],
    });
    await expect(run.run()).rejects.toThrow('boom');
    expect(events).toEqual(['cleanup']);
    expect(store.info).toBeNull();
  });
});

describe('LazyItemReader', () => {
  it('builds the workers on the first item only, once, and closes them if built', async () => {
    const log: string[] = [];
    const lazy = new LazyItemReader(() => {
      log.push('build');
      return Promise.resolve({
        reader: { read: (i) => (log.push(`read ${i.id}`), Promise.resolve(null)) },
        close: () => Promise.resolve(void log.push('close')),
      });
    });
    await lazy.close();
    expect(log).toEqual([]);
    await lazy.read(item('a'));
    await lazy.read(item('b'));
    await lazy.close();
    expect(log).toEqual(['build', 'read a', 'read b', 'close']);
  });
});
