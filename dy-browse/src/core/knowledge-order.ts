import type { KnowledgeEntry } from './knowledge';
import { dateOf } from './text';

/** When each entry was last browsed, in ms, by `<folder>/<title>`: `knowledge-visits.json`. */
export type Visits = Record<string, number>;

export const entryKey = (entry: Pick<KnowledgeEntry, 'folder' | 'title'>) =>
  `${entry.folder}/${entry.title}`;

export type Why = '复查已到' | '没浏览过' | '轮到了';

export interface DueEntry {
  entry: KnowledgeEntry;
  why: Why;
}

/** A 截至 as numbers to compare (`3.3`, `2026-11`), empty for none: which sorts last. */
function asOfParts(asOf: string): number[] {
  return (asOf.match(/\d+/g) ?? []).map(Number);
}

function compareAsOf(a: string, b: string): number {
  const x = asOfParts(a);
  const y = asOfParts(b);
  if (!x.length || !y.length) return x.length ? -1 : y.length ? 1 : 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The entries in the order to browse them: the ones whose 复查 date has passed (and not browsed
 * since), the oldest date first; then those never browsed, the oldest 截至 first; then the rest,
 * the least recently browsed first, so a daily run goes through the whole knowledge base in turn.
 */
export function entriesDue(
  entries: readonly KnowledgeEntry[],
  visits: Visits,
  now: number,
): DueEntry[] {
  const today = dateOf(now);
  const lastVisit = (e: KnowledgeEntry) => visits[entryKey(e)];
  const isDue = (e: KnowledgeEntry) => {
    const visit = lastVisit(e);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(e.reviewOn) &&
      e.reviewOn <= today &&
      (visit === undefined || dateOf(visit) < e.reviewOn)
    );
  };
  const due = entries.filter(isDue).sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));
  const rest = entries.filter((e) => !isDue(e));
  const never = rest
    .filter((e) => lastVisit(e) === undefined)
    .sort((a, b) => compareAsOf(a.asOf, b.asOf));
  const visited = rest
    .filter((e) => lastVisit(e) !== undefined)
    .sort((a, b) => lastVisit(a)! - lastVisit(b)!);
  return [
    ...due.map((entry): DueEntry => ({ entry, why: '复查已到' })),
    ...never.map((entry): DueEntry => ({ entry, why: '没浏览过' })),
    ...visited.map((entry): DueEntry => ({ entry, why: '轮到了' })),
  ];
}
