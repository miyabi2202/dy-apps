import type { SongBreakSource, SongSpan } from '../../core/songs/song-breaks';
import { shazamSpans, type ShazamSpanOptions } from '../../core/songs/shazam-spans';
import type { TranscriptLine } from '../../core/songs/transcript';
import type { Log } from '../ports';

export interface ShazamBreaksOptions {
  log: Log;
  /** How titles make spans (see shazamSpans); SHAZAM_SPANS otherwise. */
  spans?: ShazamSpanOptions;
}

/**
 * The song break source from the backing track's title, as Shazam names it on the whole mix while
 * the streamer sings (see shazamSpans), ranked below the lyrics and above the backing gaps. It
 * needs nothing but the lines: with the worker's BackingTitles add-on off, no line has a title and
 * it says nothing. Logs each new break once, as `song changed {by: shazam}`.
 */
export class ShazamBreaks implements SongBreakSource {
  readonly name = 'shazam';
  private logged: number | undefined;

  constructor(private readonly options: ShazamBreaksOptions) {}

  spans(lines: readonly TranscriptLine[]): SongSpan[] {
    const spans = shazamSpans(lines, { ...this.options.spans, by: this.name });
    const last = spans.filter((span) => span.kind === 'break').at(-1);
    if (last && last.from !== this.logged) {
      this.logged = last.from;
      this.options.log.info('song changed', { by: this.name, title: last.title, at: last.from });
    }
    return spans.map(({ from, to, kind, by }) => ({ from, to, kind, by }));
  }
}
