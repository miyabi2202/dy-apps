import { keywordCandidates } from './keywords';
import { addDays } from './drafts';
import type { BrowseItem } from './types';

export type TrendKind = 'hashtag' | 'sound' | 'phrase';

/** How many videos each day showed a term in. */
export interface TermDays {
  kind: TrendKind;
  days: Record<string, number>;
}

/** `trends.json`: hashtags, sounds and phrases by day, counted by code. */
export interface TrendsFile {
  terms: Record<string, TermDays>;
}

/** A term seen in this many videos on this many days is a trend, even when no video taught anything. */
export const TREND_VIDEOS = 3;
export const TREND_DAYS = 2;
/** A term not seen for this many days leaves the counts: memes go stale fast. */
export const FADE_DAYS = 21;

const keyOf = (kind: TrendKind, term: string) => `${kind}:${term}`;

/** The day's items counted into the file (a term counts once per video), old terms faded out. Pure. */
export function countTrends(
  file: TrendsFile,
  date: string,
  items: readonly BrowseItem[],
): TrendsFile {
  const terms: Record<string, TermDays> = {};
  const cutoff = addDays(date, -FADE_DAYS);
  for (const [key, entry] of Object.entries(file.terms)) {
    const days = Object.fromEntries(
      Object.entries(entry.days).filter(([day]) => day > cutoff && day !== date),
    );
    if (Object.keys(days).length) terms[key] = { kind: entry.kind, days };
  }
  const today = new Map<string, { kind: TrendKind; term: string; count: number }>();
  const bump = (kind: TrendKind, term: string, count: number) => {
    const key = keyOf(kind, term);
    const have = today.get(key);
    today.set(key, { kind, term, count: Math.max(count, have?.count ?? 0) });
  };
  const videos = items.filter((i) => i.kind === 'video' || i.kind === 'images');
  const tagCounts = new Map<string, number>();
  const soundCounts = new Map<string, number>();
  for (const item of videos) {
    for (const tag of new Set(item.hashtags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    const sound = item.music?.title.trim();
    if (sound) soundCounts.set(sound, (soundCounts.get(sound) ?? 0) + 1);
  }
  for (const [tag, count] of tagCounts) bump('hashtag', tag, count);
  for (const [sound, count] of soundCounts) bump('sound', sound, count);
  const phrases = keywordCandidates({
    topic: '',
    related: [],
    known: () => false,
    posts: videos.map((i) => ({ hashtags: [], texts: [i.desc] })),
    max: 200,
  });
  for (const phrase of phrases)
    if (phrase.source === 'phrase') bump('phrase', phrase.term, phrase.posts);
  for (const { kind, term, count } of today.values()) {
    const key = keyOf(kind, term);
    terms[key] = { kind, days: { ...terms[key]?.days, [date]: count } };
  }
  return { terms };
}

export interface Trend {
  term: string;
  kind: TrendKind;
  videos: number;
  days: number;
}

/** The terms seen in 3 or more videos on 2 or more days, most videos first. */
export function trendsOf(file: TrendsFile): Trend[] {
  return Object.entries(file.terms)
    .map(([key, entry]) => ({
      term: key.slice(key.indexOf(':') + 1),
      kind: entry.kind,
      videos: Object.values(entry.days).reduce((sum, n) => sum + n, 0),
      days: Object.keys(entry.days).length,
    }))
    .filter((t) => t.videos >= TREND_VIDEOS && t.days >= TREND_DAYS)
    .sort((a, b) => b.videos - a.videos || a.term.localeCompare(b.term));
}
