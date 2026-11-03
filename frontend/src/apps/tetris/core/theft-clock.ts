import { CONFIG } from './config';
import type { Cell, Sender } from './types';

/**
 * 小偷 holding play: the thief sneaking in from the side farther from the cell ('sneak'),
 * lifting it out ('grab'), then running out the nearer side with it ('flee'). `progress` runs
 * from 0 to 1 through each stage.
 */
export interface TheftView {
  stage: 'sneak' | 'grab' | 'flee';
  progress: number;
  /** Who sent it, when known: the thief wears their face. */
  sender: Sender | null;
  /** The board cell it takes, and what was in it. */
  x: number;
  y: number;
  cell: Exclude<Cell, null>;
}

/** One 小偷's stages over time. */
export class TheftClock {
  view: TheftView;
  private ms = 0;

  constructor(sender: Sender | null, x: number, y: number, cell: Exclude<Cell, null>) {
    this.view = { stage: 'sneak', progress: 0, sender, x, y, cell };
  }

  /** Moves on `dtMs`: 'done' once the thief is gone, 'changed' on a new stage, else 'same'. */
  advance(dtMs: number): 'done' | 'changed' | 'same' {
    const { sneakMs, grabMs, fleeMs } = CONFIG.theft;
    this.ms += dtMs;
    if (this.ms >= sneakMs + grabMs + fleeMs) return 'done';
    const [stage, from, length] =
      this.ms < sneakMs
        ? (['sneak', 0, sneakMs] as const)
        : this.ms < sneakMs + grabMs
          ? (['grab', sneakMs, grabMs] as const)
          : (['flee', sneakMs + grabMs, fleeMs] as const);
    const changed = stage !== this.view.stage;
    this.view = { ...this.view, stage, progress: (this.ms - from) / length };
    return changed ? 'changed' : 'same';
  }
}
