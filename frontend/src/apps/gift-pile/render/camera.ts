/** The part of the world on screen: the world y of the view's top, and its height. */
export interface View {
  top: number;
  height: number;
}

/** The camera eases towards where it should be over about this long. */
export const CAMERA_MS = 400;

/** What the camera is told each step. */
export interface CameraInput {
  /** Wall time (ms), for easing. */
  now: number;
  /** The world y of the pile's highest point, or null if there is no pile. */
  top: number | null;
  /** A removal is under way, so the camera holds still unless it has asked to move. */
  busy: boolean;
}

interface Options {
  /** An icon's drawn radius. */
  radius: number;
  /** The share of the view's height to keep clear above the pile. */
  headroom: number;
  /** The view's height: the canvas's. */
  height: number;
}

/**
 * What is steering the camera. Each step takes the one that wins out of those that want it,
 * in order of priority: a removal over the pile that follows it. (The user's own navigation
 * is to come above both.)
 */
type Mode = 'follow' | 'removal';

/**
 * The view onto the pile. It keeps `headroom` of itself clear above the pile: once the pile
 * grows into it, the view moves up with it, easing, and comes back down as the pile does,
 * but never below the floor (the view's top is never over 0). While a removal is under way
 * it holds still, so a removal is never scrolled away under it, unless the removal has asked
 * it to go somewhere (`moveTo`).
 *
 * It knows nothing of the engine or the renderer: each `step` is told when it is, how high
 * the pile is and whether a removal is on, and gives back the view; anyone interested is told
 * when the view moves (`subscribe`).
 */
export class Camera {
  private top = 0;
  private height: number;
  private mode: Mode = 'follow';
  /** Where the view is heading as of the last step; its own top if it is holding still. */
  private heading = 0;
  /** The wall time of the last step, for easing. */
  private last: number | null = null;
  /** Where a removal has asked the view's top to go, while it runs. */
  private request: number | null = null;
  private readonly listeners = new Set<(top: number) => void>();

  constructor(private readonly options: Options) {
    this.height = options.height;
  }

  /** The part of the world on screen now. */
  get view(): View {
    return { top: this.top, height: this.height };
  }

  /** The world y the view's top is heading for, as of the last step: where it will be once it has eased there. */
  get target(): number {
    return this.heading;
  }

  /** The view is `height` tall from now on: the canvas has been resized. */
  setHeight(height: number): void {
    this.height = height;
  }

  /** A removal asks for the view's top to go to `top` (never below the floor's), for as long as it runs. */
  moveTo(top: number): void {
    this.request = Math.min(0, top);
  }

  /**
   * Cut straight to where following a pile topped at `top` would put the view, rather than
   * easing there: for a removal about to begin, so it starts with the pile on screen and its
   * headroom clear, however much the pile has just changed.
   */
  frame(top: number | null): void {
    const target = this.follow(top);
    this.heading = target;
    if (target === this.top) return;
    this.top = target;
    this.notify();
  }

  /** Back to the floor at once, with nothing asked of it: the pile has been started over. */
  reset(): void {
    this.top = 0;
    this.heading = 0;
    this.request = null;
    this.mode = 'follow';
    this.notify();
  }

  /** Call `fn` with the view's new top each time it moves; the function returned stops that. */
  subscribe(fn: (top: number) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Ease the view, as of `input.now`, towards where the mode in charge wants it. Returns the view. */
  step(input: CameraInput): View {
    const dt = this.last === null ? Infinity : input.now - this.last;
    this.last = input.now;
    this.mode = this.chooseMode(input);
    if (this.mode !== 'removal') this.request = null;
    const target = this.aim(input);
    if (target === null) {
      this.heading = this.top;
      return this.view;
    }
    this.heading = target;
    if (Math.abs(target - this.top) < 0.25) {
      if (target === this.top) return this.view;
      this.top = target;
    } else {
      this.top += (target - this.top) * Math.min(1, dt / CAMERA_MS);
    }
    this.notify();
    return this.view;
  }

  /** The mode that is in charge this step. */
  private chooseMode({ busy }: CameraInput): Mode {
    return busy ? 'removal' : 'follow';
  }

  /** Where the mode in charge wants the view's top; null to hold still. */
  private aim({ top }: CameraInput): number | null {
    switch (this.mode) {
      case 'removal':
        return this.request;
      case 'follow':
        return this.follow(top);
    }
  }

  /** Where the view's top goes to follow a pile topped at `top`: its headroom clear over it, never below the floor. */
  private follow(top: number | null): number {
    if (top === null) return 0;
    const { radius, headroom } = this.options;
    return Math.min(0, top - radius - headroom * this.height);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this.top);
  }
}
