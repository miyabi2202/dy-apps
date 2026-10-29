import { LikeHold, type LikeSurface } from '../src/like-hold';

/** A page that shows the counter values it's given, one per read, then the last again. */
function setup({
  counters = [] as (number | null)[],
  tooFastAfter = Infinity,
  keyUpFails = false,
} = {}) {
  const log: string[] = [];
  let time = 0;
  let reads = 0;
  let checks = 0;
  const surface: LikeSurface = {
    focusPlayer: () => {
      log.push('focus');
      return Promise.resolve();
    },
    keyDown: () => {
      log.push('down');
      return Promise.resolve();
    },
    keyUp: () => {
      log.push('up');
      return keyUpFails ? Promise.reject(new Error('page closed')) : Promise.resolve();
    },
    counter: () => Promise.resolve(counters[Math.min(reads++, counters.length - 1)] ?? null),
    saysTooFast: () => Promise.resolve(++checks > tooFastAfter),
  };
  const hold = new LikeHold(surface, {
    now: () => time,
    wait: (ms) => {
      time += ms;
      return Promise.resolve();
    },
  });
  return { hold, log, elapsed: () => time };
}

describe('LikeHold', () => {
  it('focuses the player, then holds until the counter has added up to the likes asked', async () => {
    // Read before pressing (nothing shown), then once per 100 ms, then at the end.
    const { hold, log } = setup({ counters: [null, 3, 7, 12, 12] });
    const answer = await hold.hold(10);
    expect(answer).toEqual({ liked: 12, heldMs: 300, tooFast: false });
    expect(log).toEqual(['focus', 'down', 'down', 'down', 'down', 'up']);
  });

  it('counts only what comes after a counter left from before pressing', async () => {
    const { hold } = setup({ counters: [20, 23, 26, 26] });
    expect(await hold.hold(5)).toEqual({ liked: 6, heldMs: 200, tooFast: false });
  });

  it('keeps counting through a counter that starts again from 1', async () => {
    const { hold } = setup({ counters: [null, 8, 2, 3, 6, 6] });
    expect((await hold.hold(11)).liked).toBe(14);
  });

  it('guesses from the time held, 5 likes a second (rounded), while the counter never shows', async () => {
    const { hold, elapsed } = setup({ counters: [null] });
    expect(await hold.hold(10)).toEqual({ liked: 10, heldMs: 1900, tooFast: false });
    expect(elapsed()).toBe(1900);
  });

  it('lets go at once when the page says 手速太快了', async () => {
    const { hold, log } = setup({ counters: [null, 2, 4, 5], tooFastAfter: 2 });
    const answer = await hold.hold(100);
    expect(answer.tooFast).toBe(true);
    expect(answer.heldMs).toBe(300);
    expect(log.at(-1)).toBe('up');
    expect(log.filter((line) => line === 'down')).toHaveLength(3);
  });

  it('never holds longer than a minute, whatever the counter says', async () => {
    const { hold } = setup({ counters: [null, 1] });
    const answer = await hold.hold(200);
    expect(answer.heldMs).toBe(60_000);
    expect(answer.tooFast).toBe(false);
  });

  it('lets go of the key even when reading the page fails, and passes the failure on', async () => {
    const log: string[] = [];
    const surface: LikeSurface = {
      focusPlayer: () => Promise.resolve(),
      keyDown: () => {
        log.push('down');
        return Promise.resolve();
      },
      keyUp: () => {
        log.push('up');
        return Promise.resolve();
      },
      counter: () => Promise.resolve(null),
      saysTooFast: () => Promise.reject(new Error('page crashed')),
    };
    const hold = new LikeHold(surface, { wait: () => Promise.resolve() });
    await expect(hold.hold(10)).rejects.toThrow('page crashed');
    expect(log).toEqual(['down', 'up']);
  });

  it('does not mind the key-up failing (the page is gone)', async () => {
    const { hold } = setup({ counters: [null, 5, 5], keyUpFails: true });
    expect((await hold.hold(5)).liked).toBe(5);
  });
});
