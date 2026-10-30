import { Pace } from '../src/pace';

function setup(random = 0.5) {
  const log: string[] = [];
  const pace = new Pace({
    wait: (ms) => {
      log.push(`wait ${ms}`);
      return Promise.resolve();
    },
    random: () => random,
  });
  return { pace, log };
}

describe('Pace', () => {
  it('waits for the target, pauses 1 s plus up to 1 s more at random, then acts', async () => {
    const { pace, log } = setup(0.5);
    await pace.step(
      () => Promise.resolve(void log.push('ready')),
      () => Promise.resolve(void log.push('act')),
    );
    expect(log).toEqual(['ready', 'wait 1500', 'act']);
  });

  it('neither pauses nor acts when the target never shows', async () => {
    const { pace, log } = setup();
    await expect(
      pace.step(
        () => Promise.reject(new Error('not shown')),
        () => Promise.resolve(void log.push('act')),
      ),
    ).rejects.toThrow('not shown');
    expect(log).toEqual([]);
  });

  it('pauses before acting on a target just seen, between 1 and 2 s', async () => {
    for (const [random, ms] of [
      [0, 1000],
      [0.999, 1999],
    ] as const) {
      const { pace, log } = setup(random);
      await pace.afterSeen(() => Promise.resolve(void log.push('act')));
      expect(log).toEqual([`wait ${ms}`, 'act']);
    }
  });
});
