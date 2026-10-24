import {
  backingGapSpans,
  type BackingGapOptions,
  type BackingLevel,
} from '../../core/songs/backing-gaps';
import type { SongBreakSource, SongSpan } from '../../core/songs/song-breaks';
import type { TranscriptLine } from '../../core/songs/transcript';
import type { Log } from '../ports';

export interface BackingGapBreaksOptions {
  log: Log;
  /** How the levels make spans (see backingGapSpans); BACKING_GAPS otherwise. */
  spans?: BackingGapOptions;
  /** Levels older than this are forgotten. */
  keepMs?: number;
  now?: () => number;
}

/**
 * The song break source from the backing track stopping between songs and playing on inside one
 * (see backingGapSpans), ranked below Shazam's titles and above the pauses and talk. Fed the
 * worker's backing levels (`add`, from its BackingGaps add-on); without any, it says nothing.
 * Logs each new break once, as `song changed {by: backingGaps}`.
 */
export class BackingGapBreaks implements SongBreakSource {
  readonly name = 'backingGaps';
  private levels: BackingLevel[] = [];
  private logged: number | undefined;
  private readonly now: () => number;

  constructor(private readonly options: BackingGapBreaksOptions) {
    this.now = options.now ?? Date.now;
  }

  /** One of the worker's `backing_level` lines. */
  add(level: BackingLevel): void {
    const since = this.now() - (this.options.keepMs ?? 30 * 60_000);
    this.levels = [...this.levels.filter((kept) => kept.to >= since), level];
  }

  spans(lines: readonly TranscriptLine[]): SongSpan[] {
    const spans = backingGapSpans(lines, this.levels, { ...this.options.spans, by: this.name });
    const last = spans.filter((span) => span.kind === 'break').at(-1);
    if (last && last.from !== this.logged) {
      this.logged = last.from;
      const line = lines.find((l) => l.start === last.from);
      this.options.log.info('song changed', {
        by: this.name,
        at: last.from,
        quietMs: last.quietMs,
        ...(line && { line: line.text }),
      });
    }
    return spans.map(({ from, to, kind, by }) => ({ from, to, kind, by }));
  }
}
