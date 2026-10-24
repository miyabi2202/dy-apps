import { normaliseTitle } from '@dy-apps/lyrics-search';
import { errorMessage } from '../../core/errors';
import {
  LYRICS_BREAKS,
  lyricsBreak,
  lyricsShare,
  type LyricsBreakOptions,
} from '../../core/songs/lyric-match';
import type { SongBreakSource, SongSpan } from '../../core/songs/song-breaks';
import type { TranscriptLine } from '../../core/songs/transcript';
import type { FetchLyrics, Log } from '../ports';

export interface LyricsBreaksOptions {
  /** NetEase's lyrics of a title by a singer; empty when it has none or fails. */
  fetchLyrics: FetchLyrics;
  log: Log;
  /** How the lyrics end a song (see lyricsBreak); LYRICS_BREAKS otherwise. */
  breaks?: LyricsBreakOptions;
}

/** The song named last, with its lyrics once they came. */
interface Kept {
  title: string;
  key: string;
  /** When it was asked about: its lyrics are checked from then on. */
  since: number;
  share?: (text: string) => number;
  /** The line it was last logged as ending at. */
  ended?: TranscriptLine;
}

/**
 * The song break source from the lyrics of the song named last (see lyricsBreak), ranked first:
 * from when it was asked about, it's one song (`same`) until its lyrics stop matching what's sung,
 * where the next song starts (`break`). Fed by the song naming (`keep`), by any path (Shazam, the
 * lyrics search, Codex); the lyrics come from NetEase in the background. Until they do, when
 * NetEase has none, and once a song not named yet starts, it says nothing, and the pauses and talk
 * of currentSong decide as before.
 */
export class LyricsBreaks implements SongBreakSource {
  readonly name = 'lyrics';
  private kept: Kept | undefined;
  private fetching: Promise<void> = Promise.resolve();

  constructor(private readonly options: LyricsBreaksOptions) {}

  /**
   * Remembers that `song` was named, asked about at `since`. The same song named again only moves
   * `since` (a break before then was a mistake); another one replaces it, and its lyrics are
   * fetched (`lyrics kept`, or `no lyrics for`).
   */
  keep(song: { title: string; artist: string }, since: number): void {
    const key = normaliseTitle(song.title);
    if (!key) return;
    if (this.kept?.key === key) {
      this.kept.since = since;
      this.kept.ended = undefined;
      return;
    }
    const kept: Kept = { title: song.title, key, since };
    this.kept = kept;
    const { fetchLyrics, log } = this.options;
    this.fetching = fetchLyrics(song.title, song.artist)
      .then((lyrics) => {
        if (!lyrics.length) {
          log.info('no lyrics for', { title: song.title, artist: song.artist });
          return;
        }
        kept.share = lyricsShare(lyrics);
        log.info('lyrics kept', { title: song.title, artist: song.artist, lines: lyrics.length });
      })
      .catch((err: unknown) => {
        log.warn('no lyrics for', { title: song.title, error: errorMessage(err) });
      });
  }

  /** Resolves once the lyrics asked for last came (or didn't). */
  settled(): Promise<void> {
    return this.fetching;
  }

  /**
   * One song from when the song named last was asked about, up to the line its lyrics say the
   * next one starts at (a break there, logged once as `song changed`), or up to the last line;
   * nothing before any song is named or without its lyrics.
   */
  spans(lines: readonly TranscriptLine[]): SongSpan[] {
    const kept = this.kept;
    const share = kept?.share;
    if (!kept || !share) return [];
    const breaks = { ...LYRICS_BREAKS, ...this.options.breaks };
    const line = lyricsBreak(lines, { since: kept.since, share }, breaks);
    const by = this.name;
    if (!line) {
      const last = lines.at(-1);
      return last && last.end > kept.since
        ? [{ from: kept.since, to: last.end, kind: 'same', by }]
        : [];
    }
    if (line !== kept.ended) {
      kept.ended = line;
      this.options.log.info('song changed', {
        by,
        from: kept.title,
        line: line.text,
        at: line.start,
        misses: breaks.misses,
      });
    }
    return [
      { from: kept.since, to: line.start - 1, kind: 'same', by },
      { from: line.start, to: line.start, kind: 'break', by },
    ];
  }
}
