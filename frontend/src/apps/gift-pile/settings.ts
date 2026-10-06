import { createStore } from '@dy-apps/services';
import { PILE } from './core/config';

/** The world's size in CSS pixels, chosen on the page. */
export interface WorldSize {
  width: number;
  height: number;
}

/** What a side of the world can be set to. */
export const SIZE_RANGE = { min: 100, max: 2000 } as const;

/** A whole number of pixels within `SIZE_RANGE`, or null. */
export function parseSide(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= SIZE_RANGE.min && n <= SIZE_RANGE.max ? n : null;
}

function parseSize(raw: unknown): WorldSize | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { width, height } = raw as Record<string, unknown>;
  const w = typeof width === 'number' ? parseSide(String(width)) : null;
  const h = typeof height === 'number' ? parseSide(String(height)) : null;
  return w !== null && h !== null ? { width: w, height: h } : undefined;
}

/** The size last chosen on this browser, or the default. */
export const sizeStore = createStore<WorldSize>('gift-pile.size', {
  fallback: PILE.world,
  parse: parseSize,
});
