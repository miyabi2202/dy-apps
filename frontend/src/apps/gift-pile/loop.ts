import type { PileRenderer } from './render/renderer';

/**
 * requestAnimationFrame loop: one draw per display frame, at the current time. The
 * simulation runs in its worker at its own rate; the renderer interpolates between its
 * frames, so drawing stays smooth whatever the two rates are.
 */
export function startPileLoop(
  renderer: PileRenderer,
  getCanvas: () => HTMLCanvasElement | null,
): () => void {
  let raf = 0;
  const tick = (now: number) => {
    const canvas = getCanvas();
    if (canvas) renderer.draw(canvas, now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
