/** The most of each effect a frame takes; asking for more is ignored. */
export const MAX_SHOCKWAVES = 4;
export const MAX_HAZES = 2;

/**
 * What the removals asked of the post pass this frame: shockwaves, a lens, haze, a colour
 * split, a flash. All positions are world px on screen (already shaken). `reset` before each
 * frame.
 */
export class PostEffects {
  shockCount = 0;
  /** x, y, radius, width per shockwave. */
  readonly shocks = new Float32Array(4 * MAX_SHOCKWAVES);
  readonly shockStrengths = new Float32Array(MAX_SHOCKWAVES);
  /** x, y, radius, strength. */
  readonly lens = new Float32Array(4);
  hazeCount = 0;
  /** left, top, width, height per haze. */
  readonly hazes = new Float32Array(4 * MAX_HAZES);
  readonly hazeStrengths = new Float32Array(MAX_HAZES);
  aberration = 0;
  /** Premultiplied colour, then alpha. */
  readonly flash = new Float32Array(4);

  reset(): void {
    this.shockCount = 0;
    this.lens[3] = 0;
    this.hazeCount = 0;
    this.aberration = 0;
    this.flash.fill(0);
  }

  shockwave(x: number, y: number, radius: number, width: number, strength: number): void {
    if (this.shockCount >= MAX_SHOCKWAVES || strength === 0) return;
    const at = 4 * this.shockCount;
    this.shocks[at] = x;
    this.shocks[at + 1] = y;
    this.shocks[at + 2] = radius;
    this.shocks[at + 3] = width;
    this.shockStrengths[this.shockCount++] = strength;
  }

  /** The strongest lens asked for stays. */
  pull(x: number, y: number, radius: number, strength: number): void {
    if (strength <= this.lens[3]!) return;
    this.lens[0] = x;
    this.lens[1] = y;
    this.lens[2] = radius;
    this.lens[3] = strength;
  }

  haze(x: number, y: number, w: number, h: number, strength: number): void {
    if (this.hazeCount >= MAX_HAZES || strength <= 0) return;
    const at = 4 * this.hazeCount;
    this.hazes[at] = x;
    this.hazes[at + 1] = y;
    this.hazes[at + 2] = w;
    this.hazes[at + 3] = h;
    this.hazeStrengths[this.hazeCount++] = strength;
  }

  split(strength: number): void {
    this.aberration = Math.max(this.aberration, Math.min(1, strength));
  }

  /** A flash over what is already flashed, as one colour laid over another. */
  tint(r: number, g: number, b: number, alpha: number): void {
    const a = Math.min(1, Math.max(0, alpha));
    if (a === 0) return;
    const { flash } = this;
    const keep = 1 - a;
    flash[0] = flash[0]! * keep + r * a;
    flash[1] = flash[1]! * keep + g * a;
    flash[2] = flash[2]! * keep + b * a;
    flash[3] = flash[3]! * keep + a;
  }
}
