import { FRAME } from './core/config';
import type { PileWorld } from './core/world';
import type { PileRenderer } from './render/renderer';

/**
 * requestAnimationFrame loop: fixed simulation steps to catch up with the clock, then one
 * draw. A frame runs at most `maxStepsPerFrame` steps and the rest of the lag is dropped,
 * so a stalled or hidden tab never plays its missed time back in a burst.
 */
export function startPileLoop(
  world: PileWorld,
  renderer: PileRenderer,
  getCanvas: () => HTMLCanvasElement | null,
  frame = FRAME,
): () => void {
  const budgetMs = frame.stepMs * frame.maxStepsPerFrame;
  let last = performance.now();
  let lag = 0;
  let raf = 0;

  const tick = (now: number) => {
    lag = Math.min(lag + Math.max(0, now - last), budgetMs);
    last = now;
    while (lag >= frame.stepMs) {
      world.step(frame.stepMs / 1000);
      lag -= frame.stepMs;
    }
    const canvas = getCanvas();
    if (canvas) renderer.draw(canvas);
    raf = requestAnimationFrame(tick);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      last = performance.now();
      lag = 0;
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
