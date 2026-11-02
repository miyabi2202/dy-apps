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

/**
 * One cutscene's stages over time. The intro lasts as long as the longest any of its curses asks
 * for (`cutsceneMs`), CONFIG.cutscene.introMs by default.
 */
export class CutsceneClock {
  view: CutsceneView;
  private ms = 0;
  private readonly introMs: number;

  constructor(curses: readonly CurseDef<unknown>[], senders: readonly (Sender | null)[]) {
    this.view = { curses, senders, stage: 'intro' };
    this.introMs = Math.max(...curses.map((def) => def.cutsceneMs ?? CONFIG.cutscene.introMs));
  }

  /** Moves on `dtMs`: 'done' once GO is over, 'changed' on a new stage, else 'same'. */
  advance(dtMs: number): 'done' | 'changed' | 'same' {
    const { readyMs, goMs } = CONFIG.cutscene;
    this.ms += dtMs;
    if (this.ms >= this.introMs + readyMs + goMs) return 'done';
    const stage =
      this.ms < this.introMs ? 'intro' : this.ms < this.introMs + readyMs ? 'ready' : 'go';
    if (stage === this.view.stage) return 'same';
    this.view = { ...this.view, stage };
    return 'changed';
  }
}
