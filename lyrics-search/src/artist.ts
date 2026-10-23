import { foldArtist, normaliseTitle } from './normalise';
import type { Hit } from './types';

export interface SingerWeight {
  /** The credit as spelled by its heaviest hit. */
  artist: string;
  weight: number;
}

/** The singers under a title, heaviest first: a hit weighs `1 + pop/100`, a credit is one singer. */
export function rankSingers(hits: readonly Hit[]): SingerWeight[] {
  const groups = new Map<string, { weight: number; spelling: string; heaviest: number }>();
  for (const hit of hits) {
    const credit = hit.artists.join('、');
    const key = foldArtist(credit);
    if (!key) continue;
    const weight = 1 + hit.pop / 100;
    const group = groups.get(key) ?? { weight: 0, spelling: credit, heaviest: -1 };
    group.weight += weight;
    if (weight > group.heaviest) {
      group.heaviest = weight;
      group.spelling = credit;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ spelling, weight }) => ({ artist: spelling, weight }))
    .sort((a, b) => b.weight - a.weight);
}

/**
 * The singers NetEase marks as singing `hits` originally, with those a cover names as its
 * original, and those it marks as covering them: the top three of each, heaviest first. Its
 * search ranks covers above the original as often as not, so these marks are what tell them
 * apart; a mark can be wrong, and many songs have none.
 */
export function markedSingers(hits: readonly Hit[]): { originals: string[]; covers: string[] } {
  const top = (marked: readonly Hit[]) =>
    rankSingers(marked)
      .slice(0, 3)
      .map((s) => s.artist);
  const named = hits.flatMap((hit) =>
    hit.coverOf?.artists.length
      ? [{ title: hit.coverOf.title, artists: hit.coverOf.artists, pop: 0 }]
      : [],
  );
  return {
    originals: top([...hits.filter((hit) => hit.cover === false), ...named]),
    covers: top(hits.filter((hit) => hit.cover === true)),
  };
}

/**
 * Names the original singer of the song titled `title` (normalised) from NetEase's own marks: of
 * its versions marked original, with the originals its covers link to, one singer must be on at
 * least `share` of them, and on at least `versions` of them. A mark is sometimes wrong (遇萤: one
 * of CRITTY's uploads marked a cover, a cover marked original), so a lone mark, or marks that
 * disagree, name no one. Each version counts once (the lyric and title searches find the same
 * ones); a singer counts for every credit they're on, so CRITTY and CRITTY、橙光音乐 both count for
 * CRITTY, who is named by the credit most of their versions carry.
 */
export function pickOriginal(
  title: string,
  hits: readonly Hit[],
  { share = 0.7, versions = 2 }: { share?: number; versions?: number } = {},
): { artist?: string; share: number; versions: number } {
  const seen = new Set<string>();
  const credits: string[][] = [];
  const add = (key: string, artists: readonly string[]) => {
    if (!artists.length || seen.has(key)) return;
    seen.add(key);
    credits.push([...artists]);
  };
  for (const hit of hits) {
    if (hit.cover === false && normaliseTitle(hit.title) === title) {
      add(
        hit.id === undefined ? `${hit.title}|${hit.artists.join('、')}` : String(hit.id),
        hit.artists,
      );
    }
    const linked = hit.coverOf;
    if (linked && normaliseTitle(linked.title) === title) {
      add(`of ${linked.title}|${linked.artists.join('、')}`, linked.artists);
    }
  }
  const on = new Map<string, number>();
  for (const credit of credits) {
    for (const singer of new Set(credit.map(foldArtist))) on.set(singer, (on.get(singer) ?? 0) + 1);
  }
  const [top] = [...on].sort((a, b) => b[1] - a[1]);
  if (!top) return { share: 0, versions: 0 };
  const [singer, count] = top;
  const topShare = count / credits.length;
  if (topShare < share || count < versions) return { share: topShare, versions: count };
  // Named as most of their versions credit them: CRITTY, not CRITTY、橙光音乐.
  const spellings = new Map<string, number>();
  for (const credit of credits) {
    if (credit.some((a) => foldArtist(a) === singer)) {
      const spelling = credit.join('、');
      spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
    }
  }
  const [artist] = [...spellings].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]!;
  return { artist, share: topShare, versions: count };
}

/**
 * Names the singer only when one clearly leads: the top singer's share of the hits under the
 * winning title, counting both the lyric hits and the songs a title search found by that name,
 * must be at least `share`. Covers rank high in a lyrics search and its index can miss the
 * original even when NetEase has it (K/DA's FIRESTARTER: the lyrics search finds only covers, the
 * title search the group's own recordings), so a singer named from lyric hits alone is often a
 * cover; with no clear leader the answer is the title alone.
 */
export function pickArtist(
  hits: { lyricHits: readonly Hit[]; titleHits?: readonly Hit[] },
  share = 0.4,
): { artist?: string; share: number } {
  const singers = rankSingers([...hits.lyricHits, ...(hits.titleHits ?? [])]);
  const total = singers.reduce((sum, s) => sum + s.weight, 0);
  const top = singers[0];
  if (!top || total === 0) return { share: 0 };
  const topShare = top.weight / total;
  return topShare >= share ? { artist: top.artist, share: topShare } : { share: topShare };
}
