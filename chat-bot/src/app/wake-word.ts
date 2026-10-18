import { errorMessage } from '../core/errors';
import { soundsLike, syllables } from '../core/sounds-like';
import { isGuest, isSung, type TranscriptLine } from '../core/transcript';
import { done, failed, type Command } from './command';
import type { Log, WakeWords } from './ports';

export interface WakeWordOptions {
  /** What the streamer says in this room to wake the bot (empty never wakes it), read on each line. */
  words: WakeWords;
  /** What waking does: the bot says something now, for free. */
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
  /** The wake word as syllables, worked out again only when it changes. */
  private phrase = { text: '', syllables: [] as string[] };
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private lastWoken = -Infinity;

  constructor(private readonly options: WakeWordOptions) {
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /** Each line the streamer says, as it's heard. */
  hear(line: TranscriptLine): void {
    if (isSung(line) || isGuest(line) || !soundsLike(line.text, this.syllables())) return;
    const now = this.now();
    if (now - this.lastWoken < this.cooldownMs) return;
    this.lastWoken = now;
    this.options.log.info('woken', { text: line.text });
    void this.options.wake();
  }

  /** `/设置唤醒词 我想吃鱼了` sets this room's wake word. */
  commands(): Command[] {
    return [
      {
        name: '设置唤醒词',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!syllables(args).length)
            return failed('唤醒词要有中文，用法：/设置唤醒词 我想吃鱼了');
          try {
            this.options.words.set(args);
          } catch (err) {
            this.options.log.error('could not set the wake word', { error: errorMessage(err) });
            return failed('唤醒词没能保存，请稍后再试');
          }
          return done('已处理设置唤醒词请求');
        },
      },
    ];
  }

  private syllables(): string[] {
    const text = this.options.words.get();
    if (text !== this.phrase.text) this.phrase = { text, syllables: syllables(text) };
    return this.phrase.syllables;
  }
}
