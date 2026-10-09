import type { Gfx, ShadeInstances } from '../board';
import { SMOKE_BOX, SMOKE_SHADER } from './shader';

// Per puff, in `data`.
const X = 0;
const Y = 1;
const VX = 2;
const VY = 3;
const AGE = 4;
const LIFE = 5;
const FROM = 6;
const TO = 7;
const SEED = 8;
const STRIDE = 9;

/** One puff to add: where, how fast it drifts (px/s), how long it lives (ms), and its radius at birth and death. */
export interface PuffSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  from: number;
  to: number;
}

/**
 * Puffs of dark smoke, each growing as it drifts and fading out, stepped by time and drawn in
 * one `shadeMany` call. A puff past its capacity is not added.
 */
export class Puffs {
  private readonly data: Float32Array;
  private count = 0;
  private readonly out: ShadeInstances;

  constructor(
    private readonly capacity: number,
    private readonly rng: () => number,
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.out = {
      count: 0,
      xy: new Float32Array(capacity * 2),
      half: new Float32Array(capacity * 2),
      p: new Float32Array(capacity * 4),
      rgba: new Float32Array(capacity * 4),
    };
  }

  add(s: PuffSpawn): void {
    if (this.count >= this.capacity) return;
    const at = this.count++ * STRIDE;
    const { data } = this;
    data[at + X] = s.x;
    data[at + Y] = s.y;
    data[at + VX] = s.vx;
    data[at + VY] = s.vy;
    data[at + AGE] = 0;
    data[at + LIFE] = Math.max(1, s.life);
    data[at + FROM] = s.from;
    data[at + TO] = s.to;
    data[at + SEED] = this.rng() * 50;
  }

  /** Move them on by `dt` ms, slowing as they spread, and let go of the ones that are gone. */
  step(dt: number): void {
    const seconds = dt / 1000;
    const keep = Math.exp(-1.6 * seconds);
    const { data } = this;
    let k = 0;
    while (k < this.count) {
      const at = k * STRIDE;
      data[at + AGE] = data[at + AGE]! + dt;
      if (data[at + AGE]! >= data[at + LIFE]!) {
        const last = (this.count - 1) * STRIDE;
        if (last !== at) data.copyWithin(at, last, last + STRIDE);
        this.count--;
        continue;
      }
      data[at + VX] = data[at + VX]! * keep;
      data[at + VY] = data[at + VY]! * keep;
      data[at + X] = data[at + X]! + data[at + VX]! * seconds;
      data[at + Y] = data[at + Y]! + data[at + VY]! * seconds;
      k++;
    }
  }

  draw(gfx: Gfx): void {
    const { data, out } = this;
    for (let k = 0; k < this.count; k++) {
      const at = k * STRIDE;
      const u = data[at + AGE]! / data[at + LIFE]!;
      // Billowing out fast at first, then slowly.
      const grow = 1 - (1 - u) * (1 - u);
      const radius = data[at + FROM]! + (data[at + TO]! - data[at + FROM]!) * grow;
      out.xy[2 * k] = data[at + X]!;
      out.xy[2 * k + 1] = data[at + Y]!;
      out.half[2 * k] = radius * SMOKE_BOX;
      out.half[2 * k + 1] = radius * SMOKE_BOX;
      out.p[4 * k] = radius;
      out.p[4 * k + 1] = u;
      out.p[4 * k + 2] = data[at + SEED]!;
      out.p[4 * k + 3] = 0;
      out.rgba[4 * k] = 1;
      out.rgba[4 * k + 1] = 1;
      out.rgba[4 * k + 2] = 1;
      out.rgba[4 * k + 3] = 1;
    }
    out.count = this.count;
    if (out.count > 0) gfx.shadeMany(SMOKE_SHADER, out);
  }
}
