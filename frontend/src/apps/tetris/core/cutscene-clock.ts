import { CONFIG } from './config';
import type { CurseDef } from './curses';
import type { Sender } from './types';

/** The hold before the piece of a curse with `cutscene`: its name, then READY, then GO. */
export interface CutsceneView {
  /** The curses that fired with a cutscene at this settlement, in settlement order. */
  curses: readonly CurseDef<unknown>[];
  /** Who sent each of `curses`, when known. */
  senders: readonly (Sender | null)[];
  stage: 'intro' | 'ready' | 'go';
}

/** One cutscene's stages over time. */
export class CutsceneClock {
  view: CutsceneView;
  private ms = 0;

  constructor(curses: readonly CurseDef<unknown>[], senders: readonly (Sender | null)[]) {
    this.view = { curses, senders, stage: 'intro' };
  }

  /** Moves on `dtMs`: 'done' once GO is over, 'changed' on a new stage, else 'same'. */
  advance(dtMs: number): 'done' | 'changed' | 'same' {
    const { introMs, readyMs, goMs } = CONFIG.cutscene;
    this.ms += dtMs;
    if (this.ms >= introMs + readyMs + goMs) return 'done';
    const stage = this.ms < introMs ? 'intro' : this.ms < introMs + readyMs ? 'ready' : 'go';
    if (stage === this.view.stage) return 'same';
    this.view = { ...this.view, stage };
    return 'changed';
  }
}
