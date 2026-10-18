/** A song a lyrics site found with a fragment of its lyrics. */
export interface LyricHit {
  title: string;
  artist: string;
  /** The song's page on the site. */
  url: string;
}

/** Japanese kana: lyrics sites like j-lyric only have Japanese songs. */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** What splits a line into phrases: spaces, punctuation, and Latin letters and digits. */
const BETWEEN_PHRASES = /[\s\p{P}\p{S}A-Za-z0-9]+/u;
const FRAGMENT_LENGTH = 7;

/**
 * Short pieces of the sung `lines` (newest last) to search a lyrics site with: each phrase long
 * enough to be telling, in the last 5 Japanese lines, cut into 7-character pieces, so one
 * misheard character spoils only one of them. At most `max`, newest lines' first.
 */
export function lyricFragments(lines: readonly string[], max = 12): string[] {
  const fragments: string[] = [];
  for (const line of lines
    .filter((l) => KANA.test(l))
    .slice(-5)
    .reverse()) {
    for (const phrase of line.split(BETWEEN_PHRASES)) {
      const chars = [...phrase];
      if (chars.length < 5) continue;
      // Back to back, the last one moved back to be whole.
      for (let i = 0; i < chars.length; i += FRAGMENT_LENGTH) {
        const start = Math.max(0, Math.min(i, chars.length - FRAGMENT_LENGTH));
        fragments.push(chars.slice(start, start + FRAGMENT_LENGTH).join(''));
      }
    }
  }
  return [...new Set(fragments)].slice(0, max);
}

/** A song and how many of the fragments found it. */
export interface Candidate extends LyricHit {
  fragments: number;
}

/** The songs `found` (each fragment's hits) name, most fragments first. */
export function candidates(found: readonly (readonly LyricHit[])[]): Candidate[] {
  const bySong = new Map<string, Candidate>();
  for (const hits of found) {
    const seen = new Set<string>();
    for (const hit of hits) {
      const key = `${hit.title}\u0000${hit.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const song = bySong.get(key) ?? { ...hit, fragments: 0 };
      song.fragments++;
      bySong.set(key, song);
    }
  }
  return [...bySong.values()].sort((a, b) => b.fragments - a.fragments);
}

/**
 * The song, when the lyrics leave no doubt: found by at least 2 fragments, and by at least twice
 * as many as any other song (so a cover found as often is no winner). Null otherwise.
 */
export function clearWinner(songs: readonly Candidate[]): Candidate | null {
  const [top, next] = songs;
  if (!top || top.fragments < 2) return null;
  if (next && top.fragments < 2 * next.fragments) return null;
  return top;
}
