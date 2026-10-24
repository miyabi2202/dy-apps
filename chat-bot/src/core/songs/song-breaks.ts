import type { TranscriptLine } from './transcript';

/**
 * What a source of song breaks says about a stretch of the stream, times in ms since the epoch:
 * `break`, a new song starts at `from` (`to` is `from`); `same`, it's one song from `from` to
 * `to`, so no break falls after `from` up to `to`. `by` is the source's name, for the log.
 */
export interface SongSpan {
  from: number;
  to: number;
  kind: 'break' | 'same';
  by: string;
}

/**
 * Something that tells where songs start beyond the pauses and talk of currentSong: the lyrics of
 * the song named last, and later Shazam's title changes, or novelty on the backing track. It keeps
 * its own state, fed by whatever it needs (the lyrics source by the song naming), and `spans` is
 * pure given that state: what it makes of `lines`, the transcript lately, oldest first.
 */
export interface SongBreakSource {
  readonly name: string;
  spans(lines: readonly TranscriptLine[]): SongSpan[];
}

/** Whether `span`, a `same` one, has `at` inside it: after its start, up to its end. */
function covers(span: SongSpan, at: number): boolean {
  return span.kind === 'same' && span.from < at && at <= span.to;
}

/**
 * The sources' spans as one list, `ranked` highest first (the order they were registered):
 * a source's break counts unless a higher-ranked source's `same` span covers it; every `same`
 * span is kept, for the pauses and talk of currentSong, which rank lowest of all (see
 * isOneSong). So the lyrics, ranked first, overrule a pause while the song they know goes on, and
 * a source ranked between them overrules the pauses but not the lyrics.
 */
export function combineSpans(ranked: readonly (readonly SongSpan[])[]): SongSpan[] {
  const combined: SongSpan[] = [];
  const higher: SongSpan[] = [];
  for (const spans of ranked) {
    for (const span of spans) {
      if (span.kind === 'same' || !higher.some((same) => covers(same, span.from))) {
        combined.push(span);
      }
    }
    higher.push(...spans.filter((span) => span.kind === 'same'));
  }
  return combined;
}

/** Whether the combined `spans` say it's one song at `at`, so a pause or talk there is no break. */
export function isOneSong(spans: readonly SongSpan[], at: number): boolean {
  return spans.some((span) => covers(span, at));
}

/** The latest break in the combined `spans`, if any. */
export function lastBreak(spans: readonly SongSpan[]): SongSpan | undefined {
  return spans
    .filter((span) => span.kind === 'break')
    .reduce<SongSpan | undefined>(
      (last, span) => (!last || span.from > last.from ? span : last),
      undefined,
    );
}
