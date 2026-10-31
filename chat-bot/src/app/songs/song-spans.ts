import { combineSpans, type SongBreakSource, type SongSpan } from '../../core/songs/song-breaks';
import type { TranscriptLine } from '../../core/songs/transcript';

export interface SongSpansOptions {
  /**
   * Where songs start beyond pauses and talk (see song-breaks.ts), highest ranked first (see
   * combineSpans).
   */
  sources: readonly SongBreakSource[];
  /**
   * The song break sources the room has on, by name (room_config.json's `songBreaks`), read each
   * time; undefined for all of them.
   */
  on?: () => readonly string[] | undefined;
}

/** Where the songs in what the streamer said begin and end, by the song break sources the room has on. */
export class SongSpans {
  constructor(private readonly options: SongSpansOptions) {}

  /**
   * What the song break sources the room has on make of `lines`, combined (see combineSpans), for
   * currentSong and singingSong; none without any.
   */
  of(lines: readonly TranscriptLine[]): SongSpan[] {
    const on = this.options.on?.();
    return combineSpans(
      this.options.sources
        .filter((source) => !on || on.includes(source.name))
        .map((source) => source.spans(lines)),
    );
  }
}
