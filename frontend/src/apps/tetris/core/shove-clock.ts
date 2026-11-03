import { CONFIG } from './config';
import type { EffectType } from './curses';
import type { Sender } from './types';

/**
 * 热心 holding play as it shoves a piece that was about to lock: the helper popping up beside it
 * ('enter'), pushing it a column over, lifting it out of its gap first if it was snug ('push'),
 * the piece dropping to rest ('drop'), then a thumbs up ('thanks'). `progress` runs from 0 to 1
 * through each stage. Positions are the piece's origin in board cells.
 */
export interface ShoveView {
  stage: 'enter' | 'push' | 'drop' | 'thanks';
  progress: number;
  by: EffectType;
  /** Who sent it, when known: the helper wears their face. */
  sender: Sender | null;
  /** Where the piece was about to lock. */
  from: { x: number; y: number };
  /** How high it is lifted to clear its gap: `from.y` when it wasn't snug. */
  liftY: number;
  /** The column it is pushed to; it falls from there to `to`. */
  to: { x: number; y: number };
  /** The piece's cells relative to its origin: columns `left`–`right`, rows `top`–`bottom`. */
  box: { left: number; right: number; top: number; bottom: number };
}

const STAGES = ['enter', 'push', 'drop', 'thanks'] as const;

/** One shove's stages over time. */
export class ShoveClock {
  view: ShoveView;
  private ms = 0;

  constructor(view: Omit<ShoveView, 'stage' | 'progress'>) {
    this.view = { ...view, stage: 'enter', progress: 0 };
  }

  /** Moves on `dtMs`: 'done' once the thumbs up is over, 'changed' on a new stage, else 'same'. */
  advance(dtMs: number): 'done' | 'changed' | 'same' {
    const { enterMs, pushMs, dropMs, thanksMs } = CONFIG.shove;
    const lengths = [enterMs, pushMs, dropMs, thanksMs];
    this.ms += dtMs;
    let from = 0;
    for (const [i, stage] of STAGES.entries()) {
      const length = lengths[i]!;
      if (this.ms < from + length) {
        const changed = stage !== this.view.stage;
        this.view = { ...this.view, stage, progress: (this.ms - from) / length };
        return changed ? 'changed' : 'same';
      }
      from += length;
    }
    return 'done';
  }
}

/** Where the piece is at `view`'s moment: up out of its gap, across, then falling to rest. */
export function shovedAt(view: ShoveView): { x: number; y: number } {
  const { stage, progress: t, from, liftY, to } = view;
  if (stage === 'enter') return from;
  if (stage === 'push') {
    const lifted = liftY < from.y;
    // A snug piece spends the first half coming up, the second going across.
    const up = lifted ? Math.min(1, t * 2) : 1;
    const across = lifted ? Math.max(0, t * 2 - 1) : t;
    return { x: from.x + (to.x - from.x) * across, y: from.y + (liftY - from.y) * up };
  }
  if (stage === 'drop') return { x: to.x, y: liftY + (to.y - liftY) * t * t };
  return to;
}
