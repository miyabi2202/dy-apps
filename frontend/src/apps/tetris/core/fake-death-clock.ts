import { CONFIG } from './config';
import type { Sender } from './types';

/**
 * 假死 holding play: garbage rows pushing in ('rise'), the fake game-over screen ('dead'), , then the rows
 * sliding back out under 骗你的 ('reveal'). `progress` runs from 0 to 1 through each stage.
 */
export interface FakeDeathView {
  stage: 'rise' | 'dead' | 'reveal';
  progress: number;
  /** The game-over reason it pretends. */
  reason: string;
  /** Who sent it, when known. */
  sender: Sender | null;
  /** Garbage rows it pushes in from the bottom: just enough to push the stack off the top. */
  rows: number;
}

/** One 假死's stages over time. */
export class FakeDeathClock {
  view: FakeDeathView;
  private ms = 0;

  constructor(reason: string, sender: Sender | null, rows: number) {
    this.view = { stage: 'rise', progress: 0, reason, sender, rows };
  }

  /** Moves on `dtMs`: 'done' once the reveal is over, 'changed' on a new stage, else 'same'. */
  advance(dtMs: number): 'done' | 'changed' | 'same' {
    const { riseMs, deadMs, revealMs } = CONFIG.fakeDeath;
    this.ms += dtMs;
    if (this.ms >= riseMs + deadMs + revealMs) return 'done';
    const [stage, from, length] =
      this.ms < riseMs
        ? (['rise', 0, riseMs] as const)
        : this.ms < riseMs + deadMs
          ? (['dead', riseMs, deadMs] as const)
          : (['reveal', riseMs + deadMs, revealMs] as const);
    const changed = stage !== this.view.stage;
    this.view = { ...this.view, stage, progress: (this.ms - from) / length };
    return changed ? 'changed' : 'same';
  }

  /** Skips to the reveal, as when the streamer hits 重新开始 on the fake screen. */
  reveal(): void {
    const { riseMs, deadMs } = CONFIG.fakeDeath;
    this.ms = Math.max(this.ms, riseMs + deadMs);
    this.view = { ...this.view, stage: 'reveal', progress: 0 };
  }
}
