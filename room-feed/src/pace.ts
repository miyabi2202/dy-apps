/** How long a step pauses between its target showing and acting on it, as a person would: this, */
const PAUSE_MS = 500;
/** plus up to this much more, at random. */
const PAUSE_JITTER_MS = 500;

export interface PaceOptions {
  /** Waits this many ms; setTimeout by default. */
  wait?: (ms: number) => Promise<void>;
  /** 0 ≤ x < 1, for the pause; Math.random by default. */
  random?: () => number;
}

/**
 * How room-feed works Douyin's page, one step at a time, as a person would: wait for what the
 * step acts on to show, pause 500–1000 ms (at random), then act (a click, typing). Never act before the
 * target is seen, and never act the moment it is.
 */
export class Pace {
  /** Waits this many ms, for what else a step needs to wait for (a panel to settle). */
  readonly wait: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: PaceOptions = {}) {
    this.wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
  }

  /** Waits for `ready` (which throws when the target doesn't show in time), pauses, then acts. */
  async step(ready: () => Promise<void>, act: () => Promise<void>): Promise<void> {
    await ready();
    await this.afterSeen(act);
  }

  /** Pauses, then acts: for a target a check has just seen (a `has` that answered yes). */
  async afterSeen(act: () => Promise<void>): Promise<void> {
    await this.wait(PAUSE_MS + Math.floor(this.random() * PAUSE_JITTER_MS));
    await act();
  }
}
