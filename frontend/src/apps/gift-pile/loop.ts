import type { Pile } from './pile';

/**
 * requestAnimationFrame loop: one draw per display frame, at the current time. The
 * simulation runs in its worker at its own rate; the pile interpolates between its
 * frames, so drawing stays smooth whatever the two rates are. `onError` is called, once, with
 * the reason when the renderer finds it can't draw at all.
 */
export function startPileLoop(
  pile: Pile,
  getCanvas: () => HTMLCanvasElement | null,
  onError: (message: string) => void = () => {},
): () => void {
  let raf = 0;
  let reported = false;
  const tick = (now: number) => {
    const canvas = getCanvas();
    if (canvas) {
      pile.frame(canvas, now);
      const { rendererError } = pile;
      if (rendererError !== null && !reported) {
        reported = true;
        onError(rendererError);
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
