import type { Point, ScoopShape, World } from '../board';

/** A clump of the pile somewhere across it, between `from` and `to` as fractions of the canvas's width. */
export function clumpSomewhere(rng: () => number, from: number, to: number): ScoopShape {
  return { kind: 'clump', at: from + (to - from) * rng() };
}

/** Where a clump of icons is: its middle across, its top and bottom, and how far it reaches either side of its middle. */
export interface Clump {
  x: number;
  top: number;
  bottom: number;
  spread: number;
}

/** Where `icons` are, their middle across kept `margin` in from the canvas's sides. */
export function clumpOf(icons: readonly Point[], world: World, margin: number): Clump {
  let sumX = 0;
  let top = Infinity;
  let bottom = -Infinity;
  for (const { x, y } of icons) {
    sumX += x;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const x = Math.min(world.width - margin, Math.max(margin, sumX / icons.length));
  let spread = 0;
  for (const p of icons) spread = Math.max(spread, Math.abs(p.x - x));
  return { x, top, bottom, spread };
}
