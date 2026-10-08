import type { Color } from './gfx';

/** Straight (not premultiplied) red, green, blue and alpha, each 0 to 1. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

const cache = new Map<Color, Rgba>();
const CACHE_MAX = 512;

function hex(digits: string): Rgba | null {
  const full =
    digits.length === 3 || digits.length === 4 ? [...digits].map((c) => c + c).join('') : digits;
  if (full.length !== 6 && full.length !== 8) return null;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 1];
}

function parse(color: Color): Rgba {
  if (typeof color === 'number') {
    return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, 1];
  }
  const text = color.trim();
  if (text.startsWith('#')) return hex(text.slice(1)) ?? [1, 0, 1, 1];
  const match = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (match) {
    const parts = match[1]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255, parts[3] ?? 1];
  }
  return [1, 0, 1, 1];
}

/** A colour as straight red, green, blue and alpha, 0 to 1; magenta if it can't be read. */
export function parseColor(color: Color): Rgba {
  let rgba = cache.get(color);
  if (!rgba) {
    rgba = parse(color);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(color, rgba);
  }
  return rgba;
}
