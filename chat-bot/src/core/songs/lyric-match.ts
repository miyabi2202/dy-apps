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

/** How much of a sung line is in some lyrics (see matchShare), 0 when it has no pair. */
export function lyricsShare(lyrics: readonly string[]): (text: string) => number {
  const index = lyricsIndex(lyrics);
  return (text) => matchShare(text, index) ?? 0;
}

/** A song that was named, and its lyrics to check what's sung next against. */
export interface KnownSong {
  /** When it was asked about: lines that ended before aren't checked. */
  since: number;
  /** How much of a sung line is in its lyrics (see lyricsShare). */
  share: (text: string) => number;
}

/**
 * What undoes a break when lines after it are from the song's lyrics after all (the misses were
 * lines speech recognition garbled, or talk taken for singing): `any` one matching line; `two`
 * matching lines in a row; `long` one line of LONG_CHARS or more with STRONG_SHARE of it matching;
 * `either` two in a row or one long. With `off` a break stands.
 */
export type Heal = 'off' | 'any' | 'two' | 'long' | 'either';

/** A line this long, matching this much, is surely from the song (see Heal). */
export const LONG_CHARS = 12;
export const STRONG_SHARE = 0.7;

export interface LyricsBreakOptions {
  /** The least share of a line's pairs in the lyrics for it to be from them. */
  threshold?: number;
  /** Misses in a row that end the song. */
  misses?: number;
  /** Sung lines shorter than this many characters (without spaces or punctuation) aren't checked: 「哼哼哼」 「YEAH」 match anything or nothing. */
  minChars?: number;
  /** What undoes a break (see Heal). */
  heal?: Heal;
}

/**
 * lyricsBreak's defaults, from replaying a week of logs (scripts/song-breaks-replay.ts): of 182
 * changes from one named song to the next, they split 164 where they happened and 14 a line or so
 * late (9 within a minute), against 141 and 31 never for the pauses and talk of currentSong; and
 * 7 of 220 songs by mistake, against 27. Two misses split 3 times as many songs by mistake. Any
 * matching line undid a right break when a short line matched the old lyrics by chance (「OH OH OH
 * OH NOTHING AT ALL」); two in a row kept a wrong one; one long, strong line did neither, checked
 * by hand on 20 changes and on a recording Shazam named.
 */
export const LYRICS_BREAKS: Required<LyricsBreakOptions> = {
  threshold: 0.5,
  misses: 3,
  minChars: 8,
  heal: 'long',
};

/** A line's characters, without spaces or punctuation. */
const charsOf = (line: TranscriptLine) => line.text.replace(/[\s\p{P}]/gu, '').length;

/**
 * Where the known song ended, by its lyrics: the first of `misses` sung lines in a row, after
 * `since` and each `minChars` long or more, that aren't from its lyrics, whoever's voice sang
 * them; a line that is resets the count. The next song starts at that line, unless lines after
 * it are from the lyrics after all (see Heal): then the song goes on, and a later run of misses
 * may end it. Undefined while the song goes on. A recording playing isn't sung (see isSung), so
 * it's never checked.
 */
export function lyricsBreak(
  lines: readonly TranscriptLine[],
  known: KnownSong,
  options: LyricsBreakOptions = {},
): TranscriptLine | undefined {
  const { threshold, misses, minChars, heal } = { ...LYRICS_BREAKS, ...options };
  let first: TranscriptLine | undefined;
  let missed = 0;
  let matched = 0;
  let broke: TranscriptLine | undefined;
  for (const line of lines) {
    if (line.end <= known.since || !isSung(line) || charsOf(line) < minChars) continue;
    const share = known.share(line.text);
    if (share >= threshold) {
      first = undefined;
      missed = 0;
      matched++;
      const long = share >= STRONG_SHARE && charsOf(line) >= LONG_CHARS;
      if (broke && undoes(heal, matched, long)) broke = undefined;
      continue;
    }
    matched = 0;
    first ??= line;
    if (++missed >= misses && !broke) {
      if (heal === 'off') return first;
      broke = first;
    }
  }
  return broke;
}

/** Whether a matching line, the `matched`th in a row, `long` or not, undoes a break (see Heal). */
function undoes(heal: Heal, matched: number, long: boolean): boolean {
  switch (heal) {
    case 'off':
      return false;
    case 'any':
      return true;
    case 'two':
      return matched >= 2;
    case 'long':
      return long;
    case 'either':
      return matched >= 2 || long;
  }
}
