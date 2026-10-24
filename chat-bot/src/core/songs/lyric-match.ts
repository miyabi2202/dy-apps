import { fold } from '@dy-apps/lyrics-search';
import { syllables } from '../viewers/sounds-like';
import { isSung, type TranscriptLine } from './transcript';

/** A run of Chinese characters, of Latin letters and digits (a word), or any other letter (kana, hangul). */
const UNIT_RUNS = /\p{Script=Han}+|[\p{Script=Latin}\p{N}']+|\p{L}/gu;

/**
 * What lyrics and sung lines are compared as: traditional characters folded to simplified, then
 * each Chinese character as its pinyin (toneless, with the sounds people and speech recognition
 * mix up merged: 唱 and 常, zh and z), each Latin word in lower case, and any other letter (kana)
 * on its own. Punctuation and spaces drop out.
 */
export function lyricUnits(text: string): string[] {
  const units: string[] = [];
  for (const [run] of fold(text.normalize('NFKC')).matchAll(UNIT_RUNS)) {
    if (/\p{Script=Han}/u.test(run)) units.push(...syllables(run));
    else if (/[\p{Script=Latin}\p{N}]/u.test(run)) units.push(run.toLowerCase().replace(/'/g, ''));
    else units.push(run);
  }
  return units;
}

/** Each pair of neighbouring units, as one key. */
function bigrams(units: readonly string[]): string[] {
  return units.slice(1).map((unit, i) => `${units[i]} ${unit}`);
}

/** A song's lyrics, ready to check sung lines against (see matchShare). */
export interface LyricsIndex {
  bigrams: ReadonlySet<string>;
}

/**
 * The lyrics as one run of units: speech recognition cuts sung lines where it likes, not where
 * the lyrics break, so a pair across a lyric line break counts too.
 */
export function lyricsIndex(lyrics: readonly string[]): LyricsIndex {
  return { bigrams: new Set(bigrams(lyrics.flatMap(lyricUnits))) };
}

/**
 * How much of `text` is in the lyrics: the share of its unit pairs that appear anywhere in them,
 * 0–1; undefined when it has no pair (a single character or word).
 */
export function matchShare(text: string, index: LyricsIndex): number | undefined {
  const pairs = bigrams(lyricUnits(text));
  if (!pairs.length) return undefined;
  return pairs.filter((pair) => index.bigrams.has(pair)).length / pairs.length;
}

/** Whether a sung line is from the lyrics: at least `threshold` of its pairs are in them. */
export function lyricsMatcher(
  lyrics: readonly string[],
  threshold = 0.5,
): (text: string) => boolean {
  const index = lyricsIndex(lyrics);
  return (text) => (matchShare(text, index) ?? 0) >= threshold;
}

/** A song that was named, and its lyrics to check what's sung next against. */
export interface KnownSong {
  /** When it was named: lines that ended before aren't checked. */
  since: number;
  /** Whether a sung line is from its lyrics (see lyricsMatcher). */
  matches: (text: string) => boolean;
}

export interface LyricsBreakOptions {
  /** Misses in a row that end the song. */
  misses?: number;
  /** Sung lines shorter than this many characters (without spaces or punctuation) aren't checked: 「哼哼哼」 「YEAH」 match anything or nothing. */
  minChars?: number;
  /**
   * Whether a line from its lyrics after the break undoes it: the song was still going, and the
   * misses were lines speech recognition garbled (or talk taken for singing). Then the break is
   * the first after the last such line.
   */
  heal?: boolean;
}

/** A line's characters, without spaces or punctuation. */
const charsOf = (line: TranscriptLine) => line.text.replace(/[\s\p{P}]/gu, '').length;

/**
 * Where the known song ended, by its lyrics: the first of `misses` sung lines in a row, after
 * `since` and each `minChars` long or more, that aren't from its lyrics, whoever's voice sang
 * them; a line that is resets the count (and, with `heal`, undoes a break before it). The next
 * song starts at that line. Undefined while the song goes on.
 */
export function lyricsBreak(
  lines: readonly TranscriptLine[],
  known: KnownSong,
  { misses = 2, minChars = 6, heal = false }: LyricsBreakOptions = {},
): TranscriptLine | undefined {
  let first: TranscriptLine | undefined;
  let missed = 0;
  let broke: TranscriptLine | undefined;
  for (const line of lines) {
    if (line.end <= known.since || !isSung(line) || charsOf(line) < minChars) continue;
    if (known.matches(line.text)) {
      first = undefined;
      missed = 0;
      broke = undefined;
      continue;
    }
    first ??= line;
    if (++missed >= misses && !broke) {
      if (!heal) return first;
      broke = first;
    }
  }
  return broke;
}
