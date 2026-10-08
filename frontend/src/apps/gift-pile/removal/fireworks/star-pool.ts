import { parseColor } from '../../render/color';
import type { Color, Gfx } from '../board';
import {
  DRIP_CORE,
  DRIP_STREAK,
  DRIP_STREAK_MAX,
  GLITTER_REACH,
  GLITTER_SHADER,
  instanceBuffer,
  type InstanceBuffer,
  SMOKE_BOX,
  SMOKE_SHADER,
  SPARK_SHADER,
  STAR_CORE,
  STAR_STREAK,
  STAR_STREAK_MAX,
} from './shader';

/** What a star is, as the fireworks shaders draw it. */
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
  private stars?: InstanceBuffer;
  private glitter?: InstanceBuffer;
  private puffs?: InstanceBuffer;
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

  /** Draw them all as stars (a star or drip, then glitter, so each shader is one call), or as smoke. */
  draw(gfx: Gfx, as: 'stars' | 'smoke'): void {
    if (as === 'smoke') {
      this.puffs ??= instanceBuffer(this.capacity, 'normal');
      const out = this.puffs;
      let n = 0;
      for (let k = 0; k < this.count; k++) {
        const at = k * STRIDE;
        const u = this.data[at + AGE]! / this.data[at + LIFE]!;
        const radius = (this.data[at + SIZE]! * this.sizeOverLife(u)) / 2;
        const half = radius * SMOKE_BOX;
        this.put(out, n, at);
        out.half[2 * n] = half;
        out.half[2 * n + 1] = half;
        out.p.set([radius, u, this.data[at + SEED]!, this.gain * this.strength(u)], 4 * n);
        out.rgba[4 * n + 3] = 1;
        n++;
      }
      out.count = n;
      if (n > 0) gfx.shadeMany(SMOKE_SHADER, out);
      return;
    }
    this.stars ??= instanceBuffer(this.capacity, 'add');
    this.glitter ??= instanceBuffer(this.capacity, 'add');
    const low = gfx.quality === 'low';
    const { data: d } = this;
    const stars = this.stars;
    const glitter = this.glitter;
    let ns = 0;
    let ng = 0;
    for (let k = 0; k < this.count; k++) {
      // On a cheaper quality it draws some of them, the rest keep to themselves.
      if (low && (k * 0.618034) % 1 > LOW_SHARE) continue;
      const at = k * STRIDE;
      const u = d[at + AGE]! / d[at + LIFE]!;
      const size = d[at + SIZE]! * this.sizeOverLife(u);
      const gain = this.gain * this.strength(u) * (low ? 1.4 : 1);
      const seed = d[at + SEED]!;
      if (d[at + MODE] === GLITTER) {
        const reach = size * GLITTER_REACH;
        this.put(glitter, ng, at);
        glitter.half[2 * ng] = reach;
        glitter.half[2 * ng + 1] = reach;
        glitter.axis[2 * ng] = 1;
        glitter.axis[2 * ng + 1] = 0;
        glitter.p.set([reach, u, seed, gain], 4 * ng);
        ng++;
        continue;
      }
      const drip = d[at + MODE] === DRIP;
      const vx = d[at + VX]!;
      const vy = d[at + VY]!;
      const speed = Math.hypot(vx, vy);
      const ex = speed > 1e-3 ? vx / speed : 0;
      const ey = speed > 1e-3 ? vy / speed : 1;
      const core = size * (drip ? DRIP_CORE : STAR_CORE);
      const length = Math.min(
        Math.max(speed * (drip ? DRIP_STREAK : STAR_STREAK), size * 0.5),
        size * (drip ? DRIP_STREAK_MAX : STAR_STREAK_MAX),
      );
      const pad = core * 5;
      this.put(stars, ns, at);
      stars.xy[2 * ns] = d[at + X]! - (ex * length) / 2;
      stars.xy[2 * ns + 1] = d[at + Y]! - (ey * length) / 2;
      stars.half[2 * ns] = length / 2 + pad;
      stars.half[2 * ns + 1] = pad;
      stars.axis[2 * ns] = ex;
      stars.axis[2 * ns + 1] = ey;
      stars.p.set([length, core, u, seed], 4 * ns);
      stars.q.set([gain, drip ? 1 : 0, 0, 0], 4 * ns);
      ns++;
    }
    stars.count = ns;
    glitter.count = ng;
    if (ns > 0) gfx.shadeMany(SPARK_SHADER, stars);
    if (ng > 0) gfx.shadeMany(GLITTER_SHADER, glitter);
  }

  /** Slot `n` of `out` gets star `at`'s place and colour, unrotated. */
  private put(out: InstanceBuffer, n: number, at: number): void {
    const d = this.data;
    out.xy[2 * n] = d[at + X]!;
    out.xy[2 * n + 1] = d[at + Y]!;
    out.axis[2 * n] = 1;
    out.axis[2 * n + 1] = 0;
    out.rgba[4 * n] = d[at + COLOR]!;
    out.rgba[4 * n + 1] = d[at + COLOR + 1]!;
    out.rgba[4 * n + 2] = d[at + COLOR + 2]!;
    out.rgba[4 * n + 3] = 1;
  }
}
