import type { Pile } from './pile';

/**
 * requestAnimationFrame loop: one draw per display frame, at the current time. The
 * simulation runs in its worker at its own rate; the pile interpolates between its
 * frames, so drawing stays smooth whatever the two rates are.
 */
export function startPileLoop(pile: Pile, getCanvas: () => HTMLCanvasElement | null): () => void {
  let raf = 0;
  const tick = (now: number) => {
    const canvas = getCanvas();
    if (canvas) pile.frame(canvas, now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
