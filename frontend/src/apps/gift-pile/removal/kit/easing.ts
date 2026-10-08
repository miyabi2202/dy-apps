// Easing curves: each goes from 0 to 1 as `u` does, holding at either end outside that.

const clamp = (u: number) => Math.min(1, Math.max(0, u));

/** Slow to start and slow to stop (smoothstep). */
export function smooth(u: number): number {
  const c = clamp(u);
  return c * c * (3 - 2 * c);
}

/** Fast to start, slowing to a stop (cubic). */
export function easeOut(u: number): number {
  return 1 - (1 - clamp(u)) ** 3;
}
