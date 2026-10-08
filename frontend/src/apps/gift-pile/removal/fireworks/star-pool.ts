import { parseColor } from '../../render/color';
import type { Color, FireworkData, Gfx } from '../../render/gfx';

/** What a star is, as the fireworks shader draws it (`FireworkData.mode`). */
export const STAR = 0;
export const DRIP = 1;
export const GLITTER = 2;
export const SMOKE = 3;

/** How each kind moves: px/s² down, and the share of its speed lost a second. */
const PHYSICS = [
  { gravity: 160, drag: 0.6 },
  { gravity: 330, drag: 1 },
  { gravity: 0, drag: 0 },
  { gravity: -12, drag: 1.2 },
] as const;

/** A `low` quality pool draws this share of its stars, a little brighter each. */
const LOW_SHARE = 0.45;

export interface StarSpawn {
  x: number;
  y: number;
  /** px/s. */
  vx?: number;
  vy?: number;
  /** ms. */
  life: number;
  /** Diameter, px. */
  size: number;
  color: Color;
  mode?: number;
}

// Per star, in `data`.
const X = 0;
const Y = 1;
const VX = 2;
const VY = 3;
const AGE = 4;
const LIFE = 5;
const SIZE = 6;
const SEED = 7;
const MODE = 8;
const COLOR = 9; // r, g, b
const STRIDE = 12;

/**
 * A pool of the fireworks' stars (or of puffs of smoke), stepped by time and drawn in one call
 * (`strength` is how bright each is over its life, 0 to 1 of its life in, and `gain` scales it).
 * Deterministic given its `rng`; it holds nothing but numbers.
 */
export class StarPool {
  private readonly data: Float32Array;
  private count = 0;
  private readonly out: FireworkData;
  private readonly strength: (u: number) => number;
  private readonly gain: number;
  private readonly capacity: number;
  private readonly sizeOverLife: (u: number) => number;
  private owed = 0;

  constructor(
    capacity: number,
    private readonly rng: () => number,
    {
      strength = () => 1,
      gain = 1,
      sizeOverLife = () => 1,
    }: {
      strength?: (u: number) => number;
      gain?: number;
      sizeOverLife?: (u: number) => number;
    } = {},
  ) {
    this.capacity = Math.max(1, capacity);
    this.data = new Float32Array(this.capacity * STRIDE);
    this.strength = strength;
    this.gain = gain;
    this.sizeOverLife = sizeOverLife;
    this.out = {
      count: 0,
      xy: new Float32Array(this.capacity * 2),
      vel: new Float32Array(this.capacity * 2),
      size: new Float32Array(this.capacity),
      rgba: new Float32Array(this.capacity * 4),
      life: new Float32Array(this.capacity),
      seed: new Float32Array(this.capacity),
      mode: new Float32Array(this.capacity),
    };
  }

  /** How many are alive. */
  get alive(): number {
    return this.count;
  }

  add(s: StarSpawn): void {
    if (this.count >= this.capacity) return;
    const at = this.count++ * STRIDE;
    const { data } = this;
    const [r, g, b] = parseColor(s.color);
    data[at + X] = s.x;
    data[at + Y] = s.y;
    data[at + VX] = s.vx ?? 0;
    data[at + VY] = s.vy ?? 0;
    data[at + AGE] = 0;
    data[at + LIFE] = Math.max(1, s.life);
    data[at + SIZE] = s.size;
    data[at + SEED] = this.rng();
    data[at + MODE] = s.mode ?? STAR;
    data[at + COLOR] = r;
    data[at + COLOR + 1] = g;
    data[at + COLOR + 2] = b;
  }

  /** Add `ratePerSecond` stars a second over `dt` ms; the fractions carry over to the next call. */
  stream(ratePerSecond: number, dt: number, make: () => StarSpawn): void {
    this.owed += (ratePerSecond * Math.max(0, dt)) / 1000;
    while (this.owed >= 1) {
      this.owed -= 1;
      this.add(make());
    }
  }

  /** Move everything on by `dt` ms, and let go of what has lived out its life. */
  step(dt: number): void {
    const seconds = dt / 1000;
    const { data } = this;
    let k = 0;
    while (k < this.count) {
      const at = k * STRIDE;
      data[at + AGE] = data[at + AGE]! + dt;
      if (data[at + AGE]! >= data[at + LIFE]!) {
        // Swap-remove: the last takes its place, and is stepped as this slot next.
        const last = (this.count - 1) * STRIDE;
        if (last !== at) data.copyWithin(at, last, last + STRIDE);
        this.count--;
        continue;
      }
      const { gravity, drag } = PHYSICS[data[at + MODE]!]!;
      const keep = drag > 0 ? Math.exp(-drag * seconds) : 1;
      data[at + VY] = data[at + VY]! + gravity * seconds;
      data[at + VX] = data[at + VX]! * keep;
      data[at + VY] = data[at + VY]! * keep;
      data[at + X] = data[at + X]! + data[at + VX]! * seconds;
      data[at + Y] = data[at + Y]! + data[at + VY]! * seconds;
      k++;
    }
  }

  /** Draw them all as stars, or as smoke. */
  draw(gfx: Gfx, as: 'stars' | 'smoke'): void {
    const low = gfx.quality === 'low';
    const { data, out } = this;
    let n = 0;
    for (let k = 0; k < this.count; k++) {
      // On a cheaper quality it draws some of them, the rest keep to themselves.
      if (low && as === 'stars' && (k * 0.618034) % 1 > LOW_SHARE) continue;
      const at = k * STRIDE;
      const u = data[at + AGE]! / data[at + LIFE]!;
      out.xy[2 * n] = data[at + X]!;
      out.xy[2 * n + 1] = data[at + Y]!;
      out.vel[2 * n] = data[at + VX]!;
      out.vel[2 * n + 1] = data[at + VY]!;
      out.size[n] = data[at + SIZE]! * this.sizeOverLife(u);
      out.rgba[4 * n] = data[at + COLOR]!;
      out.rgba[4 * n + 1] = data[at + COLOR + 1]!;
      out.rgba[4 * n + 2] = data[at + COLOR + 2]!;
      out.rgba[4 * n + 3] = this.gain * this.strength(u) * (low && as === 'stars' ? 1.4 : 1);
      out.life[n] = u;
      out.seed[n] = data[at + SEED]!;
      out.mode[n] = data[at + MODE]!;
      n++;
    }
    out.count = n;
    if (n === 0) return;
    if (as === 'stars') gfx.fireworkStars(out);
    else gfx.fireworkSmoke(out);
  }
}
