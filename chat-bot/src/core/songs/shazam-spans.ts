import { normaliseTitle } from '@dy-apps/lyrics-search';
import type { SongSpan } from './song-breaks';
import { isSung, type TranscriptLine } from './transcript';

export interface ShazamSpanOptions {
  /** How many lookups in a row (none naming another title between) a title needs to count. */
  confirm?: number;
  /** How far before a title's first lookup its song may have started: one lookup cycle and its window. */
  lookbackMs?: number;
  /** The name the spans carry. */
  by?: string;
}

/** What the replay of a 34-minute stretch of live singing came to (scripts/song-break-sources.py). */
export const SHAZAM_SPANS: Required<ShazamSpanOptions> = {
  confirm: 2,
  lookbackMs: 35_000,
  by: 'shazam',
};

/** A run of sung lines over one backing title, with the lookups that named it. */
interface Run {
  key: string;
  title: string;
  first: TranscriptLine;
  last: TranscriptLine;
  lookups: Set<number>;
}

/**
 * Where the backing track the streamer sings over changes, from the titles Shazam named on the
 * whole mix (each sung line's `backing`, see the worker's BackingTitles), version tags and
 * spelling aside (normaliseTitle): a title named by `confirm` lookups in a row, after another
 * title, starts a song (`break`), where the singing paused longest since a little before its first
 * lookup; and the lines over one title, from its first to its last, are one song (`same`), so a
 * pause or talk inside it is no break. Lines with no title (nothing matched, or the add-on off)
 * say nothing, and neither do played ones (a recording isn't her singing). On a 34-minute stretch
 * of live singing over backing tracks it knew 3 of 8 (the others: tracks Shazam doesn't know), and
 * found the start of one that pauses and talk missed.
 */
export function shazamSpans(
  lines: readonly TranscriptLine[],
  options: ShazamSpanOptions = {},
): (SongSpan & { title?: string })[] {
  const { confirm, lookbackMs, by } = { ...SHAZAM_SPANS, ...options };
  const sung = lines.filter(isSung);
  const spans: (SongSpan & { title?: string })[] = [];
  let current: string | undefined;
  let run: Run | undefined;
  let same: SongSpan | undefined;
  for (const line of sung) {
    if (!line.backing) continue;
    const key = normaliseTitle(line.backing.title);
    if (!key) continue;
    if (run?.key === key) {
      run.last = line;
      run.lookups.add(line.backing.at);
    } else {
      run = {
        key,
        title: line.backing.title,
        first: line,
        last: line,
        lookups: new Set([line.backing.at]),
      };
      same = undefined;
    }
    if (run.lookups.size < confirm) continue;
    if (key !== current) {
      const at = songStart(sung, run.first, (run.first.backing?.at ?? run.first.end) - lookbackMs);
      spans.push({ from: at, to: at, kind: 'break', by, title: run.title });
      current = key;
    }
    if (same) {
      same.to = line.end;
    } else {
      same = { from: run.first.start, to: line.end, kind: 'same', by };
      spans.push(same);
    }
  }
  return spans;
}

/**
 * Where the song that `first` is in started: the start of the sung line in `sung` after the
 * longest pause before it, from `since` up to `first`.
 */
function songStart(sung: readonly TranscriptLine[], first: TranscriptLine, since: number): number {
  let best = first.start;
  let longest = -Infinity;
  let previous: TranscriptLine | undefined;
  for (const line of sung) {
    if (line.end > since) {
      const pause = line.start - (previous?.end ?? since);
      if (pause > longest) {
        longest = pause;
        best = line.start;
      }
    }
    if (line === first) break;
    previous = line;
  }
  return best;
}
