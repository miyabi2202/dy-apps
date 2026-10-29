import { normaliseTitle } from './normalise';
import type { Hit } from './types';

/**
 * Titles ranked by the votes of the queries: in each query a title's best rank `r` adds
 * `1/(1+r)`, so a song that tops several lines beats one that tops a single line. Ties keep the
 * order the titles were first seen in. `hitsBy` keeps every hit under its normalised title (a
 * dashed one under the part other hits name, and titled so, see asNamedPart).
 */
export function vote(hitsPerQuery: readonly (readonly Hit[])[]): {
  ranked: [string, number][];
  hitsBy: Map<string, Hit[]>;
} {
  const named = namedAlone(hitsPerQuery.flat());
  const score = new Map<string, number>();
  const hitsBy = new Map<string, Hit[]>();
  for (const answer of hitsPerQuery) {
    const hits = answer.map((hit) => asNamedPart(hit, named));
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

const DASH = /\s*[-–—]\s*/;

/** How many hits name each title with no dash in it, by normalised title. */
function namedAlone(hits: readonly Hit[]): Map<string, number> {
  const named = new Map<string, number>();
  for (const hit of hits) {
    if (DASH.test(hit.title)) continue;
    const key = normaliseTitle(hit.title);
    if (key) named.set(key, (named.get(key) ?? 0) + 1);
  }
  return named;
}

/**
 * A dashed title as the part other hits name on its own: 「盗墓笔记-步戏」 is the work and the song,
 * and is 步戏 when other hits are titled 步戏 (normaliseTitle would keep 盗墓笔记, as it drops what
 * follows a dash, meant for 「晴天 - DJ版」). The part most hits name wins; a title no part of
 * which is named alone stays as it is.
 */
function asNamedPart(hit: Hit, named: ReadonlyMap<string, number>): Hit {
  const parts = hit.title.split(DASH).filter((part) => part.trim());
  if (parts.length < 2) return hit;
  let pick: { part: string; count: number } | undefined;
  for (const part of parts) {
    const count = named.get(normaliseTitle(part)) ?? 0;
    if (count > (pick?.count ?? 0)) pick = { part, count };
  }
  return pick ? { ...hit, title: pick.part } : hit;
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
