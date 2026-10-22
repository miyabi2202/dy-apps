import { normaliseTitle } from './normalise';
import type { Hit } from './types';

/**
 * Titles ranked by the votes of the queries: in each query a title's best rank `r` adds
 * `1/(1+r)`, so a song that tops several lines beats one that tops a single line. Ties keep the
 * order the titles were first seen in. `hitsBy` keeps every hit under its normalised title.
 */
export function vote(hitsPerQuery: readonly (readonly Hit[])[]): {
  ranked: [string, number][];
  hitsBy: Map<string, Hit[]>;
} {
  const score = new Map<string, number>();
  const hitsBy = new Map<string, Hit[]>();
  for (const hits of hitsPerQuery) {
    const best = new Map<string, number>();
    hits.forEach((hit, rank) => {
      const key = normaliseTitle(hit.title);
      if (!key) return;
      if (!best.has(key)) best.set(key, rank);
      const all = hitsBy.get(key);
      if (all) all.push(hit);
      else hitsBy.set(key, [hit]);
    });
    for (const [key, rank] of best) score.set(key, (score.get(key) ?? 0) + 1 / (1 + rank));
  }
  const ranked = [...score].sort((a, b) => b[1] - a[1]);
  return { ranked, hitsBy };
}

/** How sure the vote is: the winner needs a minimum score and a clear lead over the runner-up. */
export function decideTitle(
  ranked: readonly [string, number][],
  queries: number,
  minScore: number,
  minRatio: number,
): { sure: boolean; why: string } {
  const [winner, runnerUp] = ranked;
  if (!winner) return { sure: false, why: 'no hits' };
  const second = runnerUp?.[1] ?? 0;
  const why = `score ${winner[1].toFixed(1)} vs ${second.toFixed(1)}`;
  if (queries < 2) return { sure: false, why: 'too few lines' };
  return { sure: winner[1] >= minScore && winner[1] >= minRatio * second, why };
}
