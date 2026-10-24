import type { SongSpan } from './song-breaks';
import { isSung, type TranscriptLine } from './transcript';

/**
 * How loud the backing (the mix without the vocals) was, a second at a time, from `from` on (ms
 * since the epoch): the worker's BackingGaps add-on measures it around singing.
 */
export interface BackingLevel {
  from: number;
  to: number;
  /** dBFS of each second. */
  db: number[];
}

/** A line of the worker's output as a BackingLevel, or null when it isn't one. */
export function parseBackingLevel(text: string): BackingLevel | null {
  if (!text.includes('"backing_level"')) return null;
  try {
    return backingLevelFrom(JSON.parse(text));
  } catch {
    return null;
  }
}

/** A parsed line of the worker's output as a BackingLevel, or null when it isn't one. */
export function backingLevelFrom(json: unknown): BackingLevel | null {
  const level = (json as { backing_level?: Record<string, unknown> } | null)?.backing_level;
  const { from, to, db } = level ?? {};
  if (typeof from !== 'number' || typeof to !== 'number' || !Array.isArray(db)) return null;
  if (!db.every((x) => typeof x === 'number')) return null;
  return { from: from * 1000, to: to * 1000, db };
}

export interface BackingGapOptions {
  /** Quiet: this many dB under the backing's median over the minute before. */
  underDb?: number;
  /** For at least this long. */
  minQuietMs?: number;
  /** A gap this close around the pause between two sung lines still counts (the times are rough). */
  slackMs?: number;
  /** Two sung lines further apart than this aren't made one song, gap or not. */
  maxSameMs?: number;
  by?: string;
}

/** What the replay of a 34-minute stretch of live singing came to (scripts/song-break-sources.py). */
export const BACKING_GAPS: Required<BackingGapOptions> = {
  underDb: 20,
  minQuietMs: 3000,
  slackMs: 3000,
  maxSameMs: 120_000,
  by: 'backingGaps',
};

/** The median needs this many seconds measured in the minute before. */
const MIN_SECONDS = 10;

/** Where the backing went quiet, as [from, to) in ms, by second. */
function quietRuns(levels: readonly BackingLevel[], options: BackingGapOptions = {}) {
  const { underDb, minQuietMs } = { ...BACKING_GAPS, ...options };
  const db = new Map<number, number>();
  for (const level of levels) {
    const first = Math.round(level.from / 1000);
    level.db.forEach((x, i) => db.set(first + i, x));
  }
  const seconds = [...db.keys()].sort((a, b) => a - b);
  const runs: { from: number; to: number }[] = [];
  let start: number | undefined;
  let last: number | undefined;
  const close = () => {
    if (start !== undefined && last !== undefined && (last + 1 - start) * 1000 >= minQuietMs) {
      runs.push({ from: start * 1000, to: (last + 1) * 1000 });
    }
    start = undefined;
  };
  for (const s of seconds) {
    const before: number[] = [];
    for (let t = s - 60; t < s; t++) {
      const x = db.get(t);
      if (x !== undefined) before.push(x);
    }
    const quiet = before.length >= MIN_SECONDS && db.get(s)! < median(before) - underDb;
    if (quiet && start !== undefined && last === s - 1) {
      last = s;
    } else {
      close();
      if (quiet) start = last = s;
    }
  }
  close();
  return { runs, measured: (from: number, to: number) => measuredAll(db, from, to) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether every second from `from` to `to` (ms) was measured. */
function measuredAll(db: Map<number, number>, from: number, to: number): boolean {
  for (let s = Math.ceil(from / 1000); s < Math.floor(to / 1000); s++) {
    if (!db.has(s)) return false;
  }
  return true;
}

/**
 * Song breaks from the backing track stopping: between two sung lines, the backing quiet (some dB
 * under its own median over the minute before, so the stream's level doesn't matter) for a few
 * seconds or more starts a song at the second line (`break`); measured throughout with no such
 * gap, the two are one song (`same`), so talk over the backing playing on is no break. Where the
 * backing wasn't measured (the add-on off, or away from singing) it says nothing. On a 34-minute
 * stretch of live singing it found 7 of 8 song starts, one that pauses and talk missed, and kept
 * a song sung twice over one backing from being split by the talk between.
 */
export function backingGapSpans(
  lines: readonly TranscriptLine[],
  levels: readonly BackingLevel[],
  options: BackingGapOptions = {},
): (SongSpan & { quietMs?: number })[] {
  const { slackMs, maxSameMs, by } = { ...BACKING_GAPS, ...options };
  if (!levels.length) return [];
  const { runs, measured } = quietRuns(levels, options);
  const sung = lines.filter(isSung);
  const spans: (SongSpan & { quietMs?: number })[] = [];
  let same: SongSpan | undefined;
  for (let i = 1; i < sung.length; i++) {
    const previous = sung[i - 1]!;
    const line = sung[i]!;
    const gap = runs.find(
      (run) => run.from > previous.end - slackMs && run.to < line.start + slackMs,
    );
    if (gap) {
      spans.push({
        from: line.start,
        to: line.start,
        kind: 'break',
        by,
        quietMs: gap.to - gap.from,
      });
      same = undefined;
    } else if (line.end - previous.end <= maxSameMs && measured(previous.end, line.start)) {
      if (same && same.to >= previous.end) {
        same.to = line.end;
      } else {
        same = { from: previous.start, to: line.end, kind: 'same', by };
        spans.push(same);
      }
    } else {
      same = undefined;
    }
  }
  return spans;
}
