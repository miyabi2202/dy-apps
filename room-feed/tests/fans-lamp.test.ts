import {
  FansLamp,
  type FansLampSurface,
  type PanelFrame,
  type PanelTarget,
} from '../src/fans-lamp';
import { Pace } from '../src/pace';

/** What one opening of the panel shows: the targets of each of its frames. */
interface Opening {
  frames: PanelTarget[][];
  /** The 「我知道了」 notice stays when clicked. */
  stuckNotice?: boolean;
}

/** A page whose panel openings are scripted; everything it's asked is logged, in order. */
class FakeSurface implements FansLampSurface {
  private opened = 0;
  private frames: FakeFrame[] = [];

  constructor(
    private readonly log: string[],
    private readonly openings: Opening[],
    public followShown = false,
    private readonly diamonds: number | null = 10,
  ) {}

  balance() {
    return Promise.resolve(this.diamonds);
  }
  /** Whether the panel is open, which shows its ×. */
  private open = false;

  closeShown() {
    return Promise.resolve(this.open);
  }
  clickClose() {
    this.log.push('close panel');
    this.open = false;
    this.frames = [];
    return Promise.resolve();
  }
  followVisible() {
    return Promise.resolve(this.followShown);
  }
  clickFollow() {
    this.log.push('click follow');
    this.followShown = false;
    return Promise.resolve();
  }
  waitForPanelButton() {
    this.log.push('wait for panel button');
    return Promise.resolve();
  }
  openPanel() {
    this.log.push('open panel');
    this.open = true;
    const opening = this.openings[this.opened++] ?? { frames: [] };
    this.frames = opening.frames.map(
      (targets) => new FakeFrame(this.log, new Set(targets), opening.stuckNotice ?? false, this),
    );
    return Promise.resolve();
  }
  panelFrames(): PanelFrame[] {
    return this.frames;
  }
  /** Joining the 粉丝团 closes the panel. */
  panelClosedByJoin() {
    this.open = false;
    this.frames = [];
  }
}

class FakeFrame implements PanelFrame {
  constructor(
    private readonly log: string[],
    private readonly shown: Set<PanelTarget>,
    private readonly stuckNotice: boolean,
    private readonly surface: FakeSurface,
  ) {}

  has(target: PanelTarget) {
    return Promise.resolve(this.shown.has(target));
  }
  click(target: PanelTarget) {
    this.log.push(`click ${target}`);
    if (target === 'notice' && !this.stuckNotice) this.shown.delete('notice');
    if (target === 'join') this.surface.panelClosedByJoin();
    return Promise.resolve();
  }
}

function setup(
  openings: Opening[],
  {
    followShown = false,
    random = 0.5,
    diamonds = 10,
  }: { followShown?: boolean; random?: number; diamonds?: number | null } = {},
) {
  const log: string[] = [];
  let time = 0;
  const surface = new FakeSurface(log, openings, followShown, diamonds);
  const pace = new Pace({
    wait: (ms) => {
      log.push(`wait ${ms}`);
      time += ms;
      return Promise.resolve();
    },
    random: () => random,
  });
  const lamp = new FansLamp(surface, { now: () => time, pace });
  return { lamp, log, elapsed: () => time };
}

const clicks = (log: string[]) => log.filter((line) => /^(click|open)/.test(line));

describe('FansLamp', () => {
  it('answers already, clicking nothing in the panel, when today’s 灯牌 is sent', async () => {
    const { lamp, log } = setup([{ frames: [['sent']] }, { frames: [['sent']] }]);
    expect(await lamp.send()).toEqual({ result: 'already' });
    expect(clicks(log)).toEqual(['open panel', 'open panel']);
  });

  it('skips joining for a member: the panel shows the 灯牌 button, which is sent', async () => {
    const { lamp, log } = setup([{ frames: [['send']] }, { frames: [['send']] }]);
    expect(await lamp.send()).toEqual({ result: 'sent' });
    expect(clicks(log)).toEqual(['open panel', 'open panel', 'click send']);
  });

  it('follows, joins and sends when the account has done none: joining closes the panel, which reopens without counting a try', async () => {
    const { lamp, log } = setup([{ frames: [['join']] }, { frames: [['send']] }, { frames: [] }], {
      followShown: true,
    });
    expect(await lamp.send()).toEqual({ result: 'sent' });
    expect(clicks(log)).toEqual([
      'click follow',
      'open panel',
      'click join',
      'open panel',
      'click send',
    ]);
    // Only the opening that sent was a try: the third was never needed.
    expect(log.filter((line) => line === 'open panel')).toHaveLength(2);
  });

  it('opens the panel again when a 「我知道了」 notice stays, and sends from the second opening', async () => {
    const { lamp, log, elapsed } = setup([
      { frames: [['send']] }, // the join step: a member
      { frames: [['notice']], stuckNotice: true },
      { frames: [['send']] },
    ]);
    expect(await lamp.send()).toEqual({ result: 'sent' });
    expect(log.filter((line) => line === 'open panel')).toHaveLength(3);
    expect(log.filter((line) => line === 'click notice').length).toBeGreaterThan(1);
    // Then the settling, the pause before the × and the ×.
    expect(log.slice(-4)).toEqual(['click send', 'wait 1500', 'wait 1500', 'close panel']);
    // The stuck opening went on for its 20 s before the next one.
    expect(elapsed()).toBeGreaterThanOrEqual(20_000);
  });

  it('closes a notice that goes away and carries on in the same opening', async () => {
    const { lamp, log } = setup([{ frames: [['send']] }, { frames: [['notice', 'send']] }]);
    expect(await lamp.send()).toEqual({ result: 'sent' });
    expect(clicks(log).slice(-3)).toEqual(['open panel', 'click notice', 'click send']);
  });

  it('throws 「粉丝团面板里没找到送灯牌」 when nothing shows in the two tries', async () => {
    const { lamp, log } = setup([{ frames: [] }, { frames: [] }, { frames: [] }]);
    await expect(lamp.send()).rejects.toThrow('粉丝团面板里没找到送灯牌');
    // The join step's opening, then two tries, each closed: nothing was open before the first.
    expect(log.filter((line) => line === 'open panel')).toHaveLength(3);
    expect(log.filter((line) => line === 'close panel')).toHaveLength(3);
  });

  it('waits 1 s plus the random part before every click, the × too, and closes the panel after each opening', async () => {
    const { lamp, log } = setup([{ frames: [['notice', 'join']] }, { frames: [['send']] }], {
      followShown: true,
      random: 0.25,
    });
    await lamp.send();
    log.forEach((line, i) => {
      if (/^(click|open|close)/.test(line)) expect(log[i - 1]).toBe('wait 1250');
    });
    expect(clicks(log)).toEqual([
      'click follow',
      'open panel',
      'click notice',
      'click join',
      'open panel',
      'click send',
    ]);
    // Each opening is left 1.5 s after its last look, then its × clicked after the pause.
    expect(log.join('\n')).toContain('wait 1500\nwait 1250\nclose panel');
  });

  it('does nothing with fewer than 2 diamonds, not even following: notEnough', async () => {
    const { lamp, log } = setup([{ frames: [['send']] }], { followShown: true, diamonds: 1 });
    expect(await lamp.send()).toEqual({ result: 'notEnough', diamonds: 1, price: 2 });
    expect(log).toEqual([]);
  });

  it('goes on with 2 diamonds, or when the balance does not show', async () => {
    for (const diamonds of [2, null]) {
      const { lamp } = setup([{ frames: [['send']] }, { frames: [['send']] }], { diamonds });
      expect(await lamp.send()).toEqual({ result: 'sent' });
    }
  });

  it('waits for the button before the first pause and the click that opens the panel', async () => {
    const { lamp, log } = setup([{ frames: [['join']] }, { frames: [['send']] }]);
    await lamp.send();
    // No panel is open at first, so there's nothing to close.
    expect(log.slice(0, 3)).toEqual(['wait for panel button', 'wait 1500', 'open panel']);
  });
});
