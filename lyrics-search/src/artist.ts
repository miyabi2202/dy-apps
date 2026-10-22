import { foldArtist } from './normalise';
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
