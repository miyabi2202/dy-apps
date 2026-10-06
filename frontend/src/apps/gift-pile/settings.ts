import { createStore } from '@dy-apps/services';
import { PILE } from './core/config';

/** The world's size in CSS pixels, chosen on the page. */
export interface WorldSize {
  width: number;
  height: number;
}

/**
 * What each side of the world can be set to. The width stops at 900 so the canvas always
 * shows at full size inside the page (which is capped at 1000 px, minus its paddings).
 */
export const SIZE_RANGE = {
  width: { min: 100, max: 900 },
  height: { min: 100, max: 2000 },
} as const;

/** A whole number of pixels within the range of that side, or null. */
export function parseSide(side: keyof typeof SIZE_RANGE, value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  const { min, max } = SIZE_RANGE[side];
  return n >= min && n <= max ? n : null;
}

function parseSize(raw: unknown): WorldSize | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { width, height } = raw as Record<string, unknown>;
  const w = typeof width === 'number' ? parseSide('width', String(width)) : null;
  const h = typeof height === 'number' ? parseSide('height', String(height)) : null;
  return w !== null && h !== null ? { width: w, height: h } : undefined;
}

/** The size last chosen on this browser, or the default. */
export const sizeStore = createStore<WorldSize>('gift-pile.size', {
  fallback: PILE.world,
  parse: parseSize,
});
