import { parseColor } from '../../render/color';
import type { Blend, Color, Gfx, ParticleData } from '../../render/gfx';

/** A `low` quality emitter keeps this share of its capacity. */
const LOW_SHARE = 0.4;

export interface EmitterOptions {
  /** The most particles alive at once; a spawn past it is dropped. Default 2048. */
  capacity?: number;
  /** Which built-in soft shape to draw; default 'disc'. */
  shape?: ParticleData['shape'];
  /** Default 'add'. */
  blend?: Blend;
  /** px/s², down is positive. Default 0. */
  gravity?: number;
  /** Share of its speed lost per second. Default 0. */
  drag?: number;
  /** Size multiplier over a life (0 at birth to 1 at death); default `1 - u`. */
  sizeOverLife?: (u: number) => number;
  /** Alpha multiplier over a life; default `1 - u`. */
  alphaOverLife?: (u: number) => number;
  /** The colour at birth, and (if given) the one it turns to by death. */
  colorFrom: Color;
  colorTo?: Color;
  /** How much its alpha flickers, 0 to 1. */
  twinkle?: number;
}

/** One particle to add. */
export interface Spawn {
  x: number;
  y: number;
  /** px/s. */
  vx?: number;
  vy?: number;
  /** How long it lives, ms. */
  life: number;
  /** Diameter at birth, px. */
  size: number;
  /** Instead of the emitter's colourFrom. */
  color?: Color;
  rotation?: number;
  /** rad/s. */
  spin?: number;
}

// Per particle, in `data`.
const X = 0;
const Y = 1;
const VX = 2;
const VY = 3;
const AGE = 4;
const LIFE = 5;
const SIZE = 6;
const ROT = 7;
const SPIN = 8;
const PHASE = 9;
const FROM = 10; // r, g, b, a
const TO = 14; // r, g, b
const STRIDE = 17;

/**
 * A pool of particles, stepped by time and drawn in one `gfx.particles` call. Deterministic
 * given its `rng`. A removal steps it by how long the frame took (`step`), spawns with `burst`
 * and `stream`, and draws it each frame; it holds nothing but numbers, so a test can run it
 * without a `Gfx`.
 */
export class Emitter {
  /** The random numbers it was given, for what spawns it (see `kit/fx.ts`). */
  readonly rng: () => number;
  private readonly capacity: number;
  private limit: number;
  private readonly data: Float32Array;
  private count = 0;
  private owed = 0;
  private readonly shape: ParticleData['shape'];
  private readonly blend: Blend;
  private readonly gravity: number;
  private readonly drag: number;
  private readonly sizeOverLife: (u: number) => number;
  private readonly alphaOverLife: (u: number) => number;
  private readonly from: Color;
  private readonly to: Color | undefined;
  private readonly twinkle: number;
  private readonly out: ParticleData;

  constructor(options: EmitterOptions, rng: () => number) {
    this.rng = rng;
    this.capacity = Math.max(1, options.capacity ?? 2048);
    this.limit = this.capacity;
    this.data = new Float32Array(this.capacity * STRIDE);
    this.shape = options.shape ?? 'disc';
    this.blend = options.blend ?? 'add';
    this.gravity = options.gravity ?? 0;
    this.drag = options.drag ?? 0;
    this.sizeOverLife = options.sizeOverLife ?? ((u) => 1 - u);
    this.alphaOverLife = options.alphaOverLife ?? ((u) => 1 - u);
    this.from = options.colorFrom;
    this.to = options.colorTo;
    this.twinkle = options.twinkle ?? 0;
    this.out = {
      count: 0,
      xy: new Float32Array(this.capacity * 2),
      size: new Float32Array(this.capacity),
      rgba: new Float32Array(this.capacity * 4),
      rotation: new Float32Array(this.capacity),
      shape: this.shape,
      blend: this.blend,
    };
  }

  /** How many are alive. */
  get alive(): number {
    return this.count;
  }

  /** Add `n` particles, each made by `make(k)`. */
  burst(n: number, make: (k: number) => Spawn): void {
    for (let k = 0; k < n; k++) this.spawn(make(k));
  }

  /** Add `ratePerSecond` particles a second over `dt` ms; the fractions carry over to the next call. */
  stream(ratePerSecond: number, dt: number, make: () => Spawn): void {
    this.owed += (ratePerSecond * Math.max(0, dt)) / 1000;
    while (this.owed >= 1) {
      this.owed -= 1;
      this.spawn(make());
    }
  }

  /** Move everything on by `dt` ms, and let go of what has lived out its life. */
  step(dt: number): void {
    const seconds = dt / 1000;
    const keep = this.drag > 0 ? Math.exp(-this.drag * seconds) : 1;
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
      // Semi-implicit Euler.
      data[at + VY] = data[at + VY]! + this.gravity * seconds;
      data[at + VX] = data[at + VX]! * keep;
      data[at + VY] = data[at + VY]! * keep;
      data[at + X] = data[at + X]! + data[at + VX]! * seconds;
      data[at + Y] = data[at + Y]! + data[at + VY]! * seconds;
      data[at + ROT] = data[at + ROT]! + data[at + SPIN]! * seconds;
      k++;
    }
  }

  /** Draw them all. */
  draw(gfx: Gfx): void {
    // On a cheaper quality it keeps to a share of its room; the ones over it live out their lives.
    this.limit =
      gfx.quality === 'low' ? Math.max(1, Math.floor(this.capacity * LOW_SHARE)) : this.capacity;
    const { data, out } = this;
    out.count = this.count;
    for (let k = 0; k < this.count; k++) {
      const at = k * STRIDE;
      const u = data[at + AGE]! / data[at + LIFE]!;
      out.xy[2 * k] = data[at + X]!;
      out.xy[2 * k + 1] = data[at + Y]!;
      out.size[k] = data[at + SIZE]! * Math.max(0, this.sizeOverLife(u));
      out.rotation![k] = data[at + ROT]!;
      let alpha = data[at + FROM + 3]! * Math.max(0, this.alphaOverLife(u));
      if (this.twinkle > 0) {
        const flicker = 0.5 + 0.5 * Math.sin(data[at + AGE]! * 0.04 + data[at + PHASE]!);
        alpha *= 1 - this.twinkle * flicker;
      }
      for (let c = 0; c < 3; c++) {
        const a = data[at + FROM + c]!;
        out.rgba[4 * k + c] = a + (data[at + TO + c]! - a) * u;
      }
      out.rgba[4 * k + 3] = alpha;
    }
    if (out.count > 0) gfx.particles(out);
  }

  /** Let go of them all. */
  clear(): void {
    this.count = 0;
    this.owed = 0;
  }

  private spawn(s: Spawn): void {
    if (this.count >= this.limit) return;
    const at = this.count++ * STRIDE;
    const { data } = this;
    const from = parseColor(s.color ?? this.from);
    const to = this.to === undefined ? from : parseColor(this.to);
    data[at + X] = s.x;
    data[at + Y] = s.y;
    data[at + VX] = s.vx ?? 0;
    data[at + VY] = s.vy ?? 0;
    data[at + AGE] = 0;
    data[at + LIFE] = Math.max(1, s.life);
    data[at + SIZE] = s.size;
    data[at + ROT] = s.rotation ?? 0;
    data[at + SPIN] = s.spin ?? 0;
    data[at + PHASE] = this.rng() * Math.PI * 2;
    data[at + FROM] = from[0];
    data[at + FROM + 1] = from[1];
    data[at + FROM + 2] = from[2];
    data[at + FROM + 3] = from[3];
    data[at + TO] = to[0];
    data[at + TO + 1] = to[1];
    data[at + TO + 2] = to[2];
  }
}
