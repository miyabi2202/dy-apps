import type { Color, SpriteSource } from '../../render/gfx';
import type { Emitter } from './particles';

// Small presets over an `Emitter`, for the bursts removals share. They take their random
// numbers from the emitter, so a fixed rng makes them repeat.

const TAU = Math.PI * 2;

/** `n` sparks flying out from (x, y) in all directions, `speed` px/s at most, living about `life` ms. */
export function sparkBurst(
  emitter: Emitter,
  x: number,
  y: number,
  color: Color,
  n: number,
  { speed = 320, life = 600, size = 7 }: { speed?: number; life?: number; size?: number } = {},
): void {
  const { rng } = emitter;
  emitter.burst(n, () => {
    const angle = rng() * TAU;
    const v = speed * (0.35 + 0.65 * rng());
    return {
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: life * (0.6 + 0.4 * rng()),
      size: size * (0.6 + 0.8 * rng()),
      color,
      rotation: angle,
    };
  });
}

/** One puff of smoke at (x, y), drifting up a little. */
export function smokePuff(emitter: Emitter, x: number, y: number, size = 14, life = 900): void {
  const { rng } = emitter;
  emitter.burst(1, () => ({
    x: x + (rng() - 0.5) * 6,
    y,
    vx: (rng() - 0.5) * 30,
    vy: -20 - 20 * rng(),
    life: life * (0.7 + 0.3 * rng()),
    size: size * (0.7 + 0.6 * rng()),
    rotation: rng() * TAU,
  }));
}

/** `n` pieces of confetti thrown up and out from (x, y), in turn from `colors`, spinning as they fall. */
export function confetti(
  emitter: Emitter,
  x: number,
  y: number,
  n: number,
  colors: readonly Color[],
  { speed = 420, life = 1400, size = 8 }: { speed?: number; life?: number; size?: number } = {},
): void {
  const { rng } = emitter;
  emitter.burst(n, (k) => {
    // Mostly upwards, in a fan.
    const angle = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 0.9;
    const v = speed * (0.4 + 0.6 * rng());
    return {
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: life * (0.7 + 0.3 * rng()),
      size: size * (0.6 + 0.8 * rng()),
      color: colors[k % colors.length],
      rotation: rng() * TAU,
      spin: (rng() - 0.5) * 12,
    };
  });
}

/**
 * Stripes that tile along v, for scrolling over a beam (`sprite(SCANLINES, { uvOffset: [0,
 * -t / 900], … })`): white bands, soft at the edges, eight to the texture.
 */
export const SCANLINES: SpriteSource = {
  key: 'fx/scanlines',
  width: 16,
  height: 64,
  paint(ctx) {
    for (let k = 0; k < 8; k++) {
      const g = ctx.createLinearGradient(0, k * 8, 0, k * 8 + 8);
      g.addColorStop(0, 'rgba(255, 255, 255, 0)');
      g.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      g.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, k * 8, 16, 8);
    }
  },
};
