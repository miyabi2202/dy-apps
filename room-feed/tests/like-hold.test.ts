import { LikeHold, type LikeSurface } from '../src/like-hold';
import { Pace } from '../src/pace';

/** A pace on a fake clock: pauses (random 0, so 500 ms) are logged, the 100 ms key repeats aren't. */
function fakePace(log: string[], tick: (ms: number) => void = () => {}): Pace {
  return new Pace({
    wait: (ms) => {
      if (ms >= 500) log.push(`pause ${ms}`);
      tick(ms);
      return Promise.resolve();
    },
    random: () => 0,
  });
}

/** A page that shows the counter values it's given, one per read, then the last again. */
function setup({
  counters = [] as (number | null)[],
  tooFastAfter = Infinity,
  keyUpFails = false,
  player = true,
} = {}) {
  const log: string[] = [];
  let time = 0;
  let reads = 0;
  let checks = 0;
  const surface: LikeSurface = {
    playerShown: () => Promise.resolve(player),
    clickPlayer: () => {
      log.push('click player');
      return Promise.resolve();
    },
    blurFocus: () => {
      log.push('blur');
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
    pace: fakePace(log, (ms) => (time += ms)),
  });
  return { hold, log, elapsed: () => time };
}

describe('LikeHold', () => {
  it('clicks the player after a pause, presses after another, then holds until the counter has added up to the likes asked', async () => {
    // Read before pressing (nothing shown), then once per 100 ms, then at the end.
    const { hold, log } = setup({ counters: [null, 3, 7, 12, 12] });
    const answer = await hold.hold(10);
    expect(answer).toEqual({ liked: 12, heldMs: 300, tooFast: false });
    expect(log).toEqual([
      'pause 500',
      'click player',
      'pause 500',
      'down',
      'down',
      'down',
      'down',
      'up',
    ]);
  });

  it('without a player, lets go of the focus at once, and still pauses before pressing', async () => {
    const { hold, log } = setup({ counters: [null, 5, 5], player: false });
    await hold.hold(5);
    expect(log.slice(0, 3)).toEqual(['blur', 'pause 500', 'down']);
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
    // The two pauses come before the hold, so it isn't counted from them.
    expect(elapsed()).toBe(1000 + 1900);
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
      playerShown: () => Promise.resolve(true),
      clickPlayer: () => Promise.resolve(),
      blurFocus: () => Promise.resolve(),
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
    const hold = new LikeHold(surface, { pace: fakePace([]) });
    await expect(hold.hold(10)).rejects.toThrow('page crashed');
    expect(log).toEqual(['down', 'up']);
  });

  it('does not mind the key-up failing (the page is gone)', async () => {
    const { hold } = setup({ counters: [null, 5, 5], keyUpFails: true });
    expect((await hold.hold(5)).liked).toBe(5);
  });
});
