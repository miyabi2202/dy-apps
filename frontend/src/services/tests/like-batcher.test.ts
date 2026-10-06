import { LikeBatcher } from '..';

/** A fake clock: `schedule` queues callbacks and `advance` runs those that are due. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; run: () => void }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((t) => t !== timer);
      };
    },
    advance(ms: number) {
      now += ms;
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
      timers = timers.filter((t) => t.at > now);
      for (const t of due) t.run();
    },
    pending: () => timers.length,
  };
}

function setup(quietMs?: number) {
  const clock = fakeClock();
  const flushed: [string, number][] = [];
  const batcher = new LikeBatcher<string>({
    onFlush: (last, total) => flushed.push([last, total]),
    quietMs,
    schedule: clock.schedule,
  });
  return { clock, flushed, batcher };
}

describe('LikeBatcher', () => {
  it('adds up likes and restarts the wait on each one, reporting the last event', () => {
    const { clock, flushed, batcher } = setup();
    batcher.add('a', 'e1', 3);
    clock.advance(4000);
    batcher.add('a', 'e2', 4);
    clock.advance(4000);
    batcher.add('a', 'e3', 1);
    clock.advance(4999);
    expect(flushed).toEqual([]);
    clock.advance(1);
    expect(flushed).toEqual([['e3', 8]]);
  });

  it('keeps each user separate', () => {
    const { clock, flushed, batcher } = setup();
    batcher.add('a', 'a1', 2);
    clock.advance(2000);
    batcher.add('b', 'b1', 5);
    clock.advance(3000);
    expect(flushed).toEqual([['a1', 2]]);
    clock.advance(2000);
    expect(flushed).toEqual([
      ['a1', 2],
      ['b1', 5],
    ]);
  });

  it('starts a new run after reporting', () => {
    const { clock, flushed, batcher } = setup();
    batcher.add('a', 'e1', 3);
    clock.advance(5000);
    batcher.add('a', 'e2', 2);
    clock.advance(5000);
    expect(flushed).toEqual([
      ['e1', 3],
      ['e2', 2],
    ]);
  });

  it('counts a like with no or a bad count as one', () => {
    const { clock, flushed, batcher } = setup();
    batcher.add('a', 'e1', 0);
    batcher.add('a', 'e2', -4);
    clock.advance(5000);
    expect(flushed).toEqual([['e2', 2]]);
  });

  it('takes another quiet period', () => {
    const { clock, flushed, batcher } = setup(1000);
    batcher.add('a', 'e1', 1);
    clock.advance(1000);
    expect(flushed).toEqual([['e1', 1]]);
  });

  it('drops everything pending on clear', () => {
    const { clock, flushed, batcher } = setup();
    batcher.add('a', 'e1', 3);
    batcher.add('b', 'e2', 3);
    batcher.clear();
    expect(clock.pending()).toBe(0);
    clock.advance(60_000);
    expect(flushed).toEqual([]);
  });
});
