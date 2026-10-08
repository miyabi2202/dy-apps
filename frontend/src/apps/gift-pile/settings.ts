import { createStore } from '@dy-apps/services';
import { PILE } from './core/config';
import type { Quality } from './render/gfx';

/** The world's size in CSS pixels, chosen on the page. */
export interface WorldSize {
  width: number;
  height: number;
}

/**
 * What each side of the play area can be set to. The width stops at 900 so the canvas (16 px
 * wider, for the margin) always shows at full size inside the page (capped at 1000 px,
 * minus its paddings).
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

/** A list of names, or undefined if it is anything else. */
function parseNames(raw: unknown): string[] | undefined {
  return Array.isArray(raw) && raw.every((name) => typeof name === 'string') ? raw : undefined;
}

/**
 * The removers turned off on this browser, by name: kept as the ones off, so a remover added
 * later starts on.
 */
export const removersOffStore = createStore<string[]>('gift-pile.removers-off', {
  fallback: [],
  parse: parseNames,
});

/** The size last chosen on this browser, or the default. */
export const sizeStore = createStore<WorldSize>('gift-pile.size', {
  fallback: PILE.world,
  parse: parseSize,
});

/** The showy extras, each of which can be turned off, and how much they may cost. */
export interface EffectSettings {
  /** The anime banner (and the freeze-frame) as a removal gets going. */
  cutIns: boolean;
  /** The screen shake. */
  shake: boolean;
  quality: Quality;
}

/** The effects as first set: everything on, at the quality `detectQuality` found; the store's fallback has `high` for it. */
const DEFAULT_EFFECTS: EffectSettings = { cutIns: true, shake: true, quality: 'high' };

function parseEffects(raw: unknown): EffectSettings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { cutIns, shake, quality } = raw as Record<string, unknown>;
  if (typeof cutIns !== 'boolean' || typeof shake !== 'boolean') return undefined;
  if (quality !== 'high' && quality !== 'low') return undefined;
  return { cutIns, shake, quality };
}

/** The effects chosen on this browser. */
export const effectsStore = createStore<EffectSettings>('gift-pile.effects', {
  fallback: DEFAULT_EFFECTS,
  parse: parseEffects,
});

/**
 * `low` on a touch device or one with four cores or fewer, which have the least to spare for
 * bloom and the like; `high` otherwise. What it asks of the browser can be given in.
 */
export function detectQuality(
  coarsePointer: boolean = typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches,
  cores: number | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.hardwareConcurrency,
): Quality {
  return coarsePointer || (cores !== undefined && cores <= 4) ? 'low' : 'high';
}

/** The effects chosen on this browser, or (before any choice) all on at the detected quality. */
export function readEffects(
  store: Pick<typeof effectsStore, 'read'> = effectsStore,
  detect: () => Quality = detectQuality,
): EffectSettings {
  const stored = store.read();
  return stored === DEFAULT_EFFECTS ? { ...stored, quality: detect() } : stored;
}

/** Whether the visitor asked their system for less motion: no shake or freeze-frames then. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
