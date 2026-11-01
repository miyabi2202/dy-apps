import type { BrowseItem } from './types';

export type DwellAction = 'skip' | 'watch' | 'watchWithComments';

export interface DwellDecision {
  action: DwellAction;
  /** How long to stay on the video before moving on, in ms. */
  dwellMs: number;
}

/** What to do with each item the feed shows. */
export interface DwellRule {
  decide(item: BrowseItem): DwellDecision;
}

/** The longest a video is watched, however long it is, in ms. */
export const MAX_WATCH_MS = 180_000;

/** A steady scroll with no watching rule: every item watched 3–6 s. */
export function fixedDwell(random: () => number = Math.random): DwellRule {
  return { decide: () => ({ action: 'watch', dwellMs: 3000 + Math.floor(random() * 3000) }) };
}

/** `from` ms plus up to `span` ms more, at random. */
const between = (random: () => number, from: number, span: number) =>
  from + Math.floor(random() * span);

/**
 * How a person's scrolling goes, with some randomness so no meme bubble forms from always
 * lingering on the funniest: ads, live cards and shop links skipped at once; of videos, about half
 * skipped after 1–3 s, four in ten watched to the end (up to 3 minutes), one in ten watched with the
 * comments opened; image posts watched for 5–10 s.
 */
export function randomDwell({ random = Math.random }: { random?: () => number } = {}): DwellRule {
  return {
    decide(item) {
      if (item.kind === 'ad' || item.kind === 'live' || item.kind === 'shop') {
        return { action: 'skip', dwellMs: 0 };
      }
      if (item.kind === 'images') return { action: 'watch', dwellMs: between(random, 5000, 5000) };
      const roll = random();
      if (roll < 0.5) return { action: 'skip', dwellMs: between(random, 1000, 2000) };
      const toEnd = Math.min(item.durationMs || MAX_WATCH_MS, MAX_WATCH_MS);
      return { action: roll < 0.9 ? 'watch' : 'watchWithComments', dwellMs: toEnd };
    },
  };
}
