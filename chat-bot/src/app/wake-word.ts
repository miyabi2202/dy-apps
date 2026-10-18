import { soundsLike, syllables } from '../core/sounds-like';
import { isGuest, isSung, type TranscriptLine } from '../core/transcript';
import type { Log } from './ports';

export interface WakeWordOptions {
  /** What the streamer says to wake the bot; empty never wakes it. */
  phrase: string;
  /** What waking does: the bot says something now, like /回复, for free. */
  wake: () => Promise<unknown>;
  /** Ignore the phrase for this long after it woke the bot. */
  cooldownMs?: number;
  now?: () => number;
  log: Log;
}

/**
 * Wakes the bot when the streamer says the phrase: a spoken line (not sung, not the guest they're
 * linked up with) with something that sounds like it (see soundsLike), so the recognizer getting
 * a character wrong doesn't matter. Once woken it ignores the phrase for `cooldownMs`, so saying
 * it twice, or talking about it, doesn't make the bot talk over and over.
 */
export class WakeWord {
  private readonly phrase: string[];
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private lastWoken = -Infinity;

  constructor(private readonly options: WakeWordOptions) {
    this.phrase = syllables(options.phrase);
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Each line the streamer says, as it's heard. */
  hear(line: TranscriptLine): void {
    if (isSung(line) || isGuest(line) || !soundsLike(line.text, this.phrase)) return;
    const now = this.now();
    if (now - this.lastWoken < this.cooldownMs) return;
    this.lastWoken = now;
    this.options.log.info('woken', { text: line.text });
    void this.options.wake();
  }
}
