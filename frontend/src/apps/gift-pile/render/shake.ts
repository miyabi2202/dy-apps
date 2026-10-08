import type { FrameOffset } from './gl-renderer';

interface Burst {
  amplitude: number;
  start: number;
  ms: number;
  /** Tells one burst's wobble from another's. */
  seed: number;
}

/** A shake is never stronger than this, in world px, however many pile up. */
const MAX_SHAKE = 24;
/** The wobble changes direction this often, ms. */
const STEP_MS = 16;

/** A number in [0, 1) from two integers, the same every time. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * The screen shake: bursts that each start hard and die away, added up into how far to move
 * the picture. The direction jumps about every frame or so, from a hash of the time, so the
 * same times give the same shake and nothing needs random numbers.
 */
export class Shaker {
  private bursts: Burst[] = [];
  private count = 0;
  private readonly offset: FrameOffset = { x: 0, y: 0 };

  /** Shake `amplitude` world px, dying away over `ms`, from wall time `now`. */
  add(amplitude: number, ms: number, now: number): void {
    if (!(amplitude > 0) || !(ms > 0)) return;
    this.bursts.push({ amplitude, start: now, ms, seed: this.count++ });
  }

  /** Stop at once. */
  clear(): void {
    this.bursts = [];
  }

  /** How far to move the picture at wall time `now`. The same object each time. */
  at(now: number): FrameOffset {
    const step = Math.floor(now / STEP_MS);
    let x = 0;
    let y = 0;
    this.bursts = this.bursts.filter((burst) => now - burst.start < burst.ms);
    for (const burst of this.bursts) {
      const left = 1 - Math.max(0, now - burst.start) / burst.ms;
      const size = burst.amplitude * left * left;
      const angle = hash(step, burst.seed) * Math.PI * 2;
      x += Math.cos(angle) * size;
      y += Math.sin(angle) * size;
    }
    const length = Math.hypot(x, y);
    const scale = length > MAX_SHAKE ? MAX_SHAKE / length : 1;
    this.offset.x = x * scale;
    this.offset.y = y * scale;
    return this.offset;
  }
}
