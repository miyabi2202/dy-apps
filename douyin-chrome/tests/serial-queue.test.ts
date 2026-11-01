import { SerialQueue } from '../src/serial-queue';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

/** A task that runs until `finish` or `fail` is called, noting when it starts and ends. */
function gated(name: string, log: string[]) {
  let finish = () => {};
  let fail: (e: Error) => void = () => {};
  const done = new Promise<string>((resolve, reject) => {
    finish = () => resolve(name);
    fail = reject;
  });
  const task = async () => {
    log.push(`start ${name}`);
    try {
      return await done;
    } finally {
      log.push(`end ${name}`);
    }
  };
  return { task, finish, fail };
}

describe('SerialQueue', () => {
  it('runs tasks one at a time, in order', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const a = gated('a', log);
    const b = gated('b', log);
    const first = queue.run(a.task);
    const second = queue.run(b.task);
    await flush();
    expect(log).toEqual(['start a']);
    a.finish();
    expect(await first).toBe('a');
    await flush();
    expect(log).toEqual(['start a', 'end a', 'start b']);
    b.finish();
    expect(await second).toBe('b');
  });

  it('does not let a failed task block the next, and gives the failure to its own caller', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const a = gated('a', log);
    const b = gated('b', log);
    const first = queue.run(a.task);
    const second = queue.run(b.task);
    a.fail(new Error('boom'));
    await expect(first).rejects.toThrow('boom');
    await flush();
    expect(log).toContain('start b');
    b.finish();
    expect(await second).toBe('b');
  });

  it('turns a task that throws at once into a rejection', async () => {
    const queue = new SerialQueue();
    await expect(
      queue.run(() => {
        throw new Error('now');
      }),
    ).rejects.toThrow('now');
    expect(await queue.run(() => 7)).toBe(7);
  });
});
