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
 * Names the singer only when one clearly owns the song on NetEase: the top singer's share of the
 * lyric hits under the winning title must be at least `share`. Covers rank high and the original
 * often isn't there (every hit for 晴天 is a cover), so a singer named from a crowd is usually
 * wrong; with no clear owner the answer is the title alone.
 */
export function pickArtist(hits: readonly Hit[], share = 0.5): { artist?: string; share: number } {
  const singers = rankSingers(hits);
  const total = singers.reduce((sum, s) => sum + s.weight, 0);
  const top = singers[0];
  if (!top || total === 0) return { share: 0 };
  const topShare = top.weight / total;
  return topShare >= share ? { artist: top.artist, share: topShare } : { share: topShare };
}
