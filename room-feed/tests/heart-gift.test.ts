import { HeartGift, type GiftPanelSurface } from '../src/heart-gift';
import { Pace } from '../src/pace';

/** A gift bar and panel whose balance and search are scripted; everything it's asked is logged, in order. */
class FakeSurface implements GiftPanelSurface {
  private open = false;

  constructor(
    private readonly log: string[],
    /** The balance, which a sent 小心心 lowers by `drop`; null when it doesn't show. */
    public diamonds: number | null,
    private readonly options: {
      searchOpen?: boolean;
      noResult?: boolean;
      drop?: number;
      panelOpen?: boolean;
    } = {},
  ) {
    this.open = options.panelOpen === true;
  }

  closeShown() {
    return Promise.resolve(this.open);
  }
  clickClose() {
    this.log.push('close panel');
    this.open = false;
    return Promise.resolve();
  }
  balance() {
    return Promise.resolve(this.diamonds);
  }
  waitForMore() {
    this.log.push('wait for 更多');
    return Promise.resolve();
  }
  clickMore() {
    this.log.push('click 更多');
    this.open = true;
    return Promise.resolve();
  }
  waitForPanel() {
    this.log.push('wait for panel');
    return Promise.resolve();
  }
  searchShown() {
    return Promise.resolve(this.options.searchOpen === true);
  }
  waitForSearchIcon() {
    this.log.push('wait for search icon');
    return Promise.resolve();
  }
  clickSearchIcon() {
    this.log.push('click search icon');
    return Promise.resolve();
  }
  waitForSearchBox() {
    this.log.push('wait for search box');
    return Promise.resolve();
  }
  typeSearch(text: string) {
    this.log.push(`type ${text}`);
    return Promise.resolve();
  }
  waitForResult(name: string) {
    if (this.options.noResult) return Promise.reject(new Error('no result'));
    this.log.push(`wait for ${name}`);
    return Promise.resolve();
  }
  clickResult(name: string) {
    this.log.push(`click ${name}`);
    if (this.diamonds !== null) this.diamonds -= this.options.drop ?? 1;
    return Promise.resolve();
  }
}

function setup(diamonds: number | null, options?: ConstructorParameters<typeof FakeSurface>[2]) {
  const log: string[] = [];
  let time = 0;
  const surface = new FakeSurface(log, diamonds, options);
  const pace = new Pace({
    wait: (ms) => {
      log.push(`wait ${ms}`);
      time += ms;
      return Promise.resolve();
    },
    random: () => 0.25,
  });
  const heart = new HeartGift(surface, { now: () => time, pace });
  return { heart, log, elapsed: () => time };
}

const steps = (log: string[]) => log.filter((line) => !/^wait \d/.test(line));

describe('HeartGift', () => {
  it('waits for each target, pauses 500 ms plus the random part, then acts: 更多, search, typing, the result', async () => {
    const { heart, log } = setup(11);
    expect(await heart.send()).toEqual({ result: 'sent', diamondsLeft: 10 });
    expect(log.slice(0, 13)).toEqual([
      'wait for 更多',
      'wait 625',
      'click 更多',
      'wait for panel',
      'wait for search icon',
      'wait 625',
      'click search icon',
      'wait for search box',
      'wait 625',
      'type 小心心',
      'wait for 小心心',
      'wait 625',
      'click 小心心',
    ]);
    // The diamond went at the first look; the panel settles, then its × after a pause.
    expect(log.slice(13)).toEqual(['wait 500', 'wait 1500', 'wait 625', 'close panel']);
  });

  it('closes a panel left open first, as a step of its own', async () => {
    const { heart, log } = setup(5, { panelOpen: true });
    await heart.send();
    expect(log.slice(0, 3)).toEqual(['wait 625', 'close panel', 'wait for 更多']);
  });

  it('types into the search box straight away when it is still open from the last time', async () => {
    const { heart, log } = setup(5, { searchOpen: true });
    expect(await heart.send()).toEqual({ result: 'sent', diamondsLeft: 4 });
    expect(steps(log)).not.toContain('click search icon');
    expect(steps(log)).toContain('type 小心心');
  });

  it('does nothing when there is less than a diamond: notEnough', async () => {
    const { heart, log } = setup(0, { panelOpen: true });
    expect(await heart.send()).toEqual({ result: 'notEnough', diamonds: 0, price: 1 });
    expect(log).toEqual([]);
  });

  it('throws when the balance does not drop after the click, having watched it for 5 s', async () => {
    const { heart, log, elapsed } = setup(7, { drop: 0 });
    await expect(heart.send()).rejects.toThrow('点了小心心，钻石没少（还是 7 钻），可能没送出去');
    expect(log.filter((line) => line === 'click 小心心')).toHaveLength(1);
    expect(log.at(-1)).toBe('close panel');
    expect(elapsed()).toBeGreaterThanOrEqual(5000);
  });

  it('sends and answers null when the balance does not show', async () => {
    const { heart, log } = setup(null);
    expect(await heart.send()).toEqual({ result: 'sent', diamondsLeft: null });
    expect(steps(log)).toContain('click 小心心');
  });

  it('clicks nothing and closes the panel when no 小心心 shows in the results', async () => {
    const { heart, log } = setup(3, { noResult: true });
    await expect(heart.send()).rejects.toThrow('no result');
    expect(steps(log)).not.toContain('click 小心心');
    expect(log.at(-1)).toBe('close panel');
  });
});
