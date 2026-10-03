import { CONFIG } from './core/config';
import type { GameEngine } from './core/game';
import type { KeyboardController } from './input/keyboard';
import { drawBoard } from './render/board';

/**
 * requestAnimationFrame loop: input repeat → engine tick → canvas draw.
 * Frame deltas are clamped so a stalled tab never "catches up" gravity, and
 * hiding the page pauses the game and drops held keys.
 */
export function startGameLoop(
  engine: GameEngine,
  keyboard: KeyboardController,
  getCanvas: () => HTMLCanvasElement | null,
): () => void {
  let last = performance.now();
  let raf = 0;

  const frame = (now: number) => {
    const dt = Math.min(Math.max(0, now - last), CONFIG.frame.maxDtMs);
    last = now;
    if (engine.phase === 'playing') {
      keyboard.update(dt);
      engine.tick(dt);
    }
    const canvas = getCanvas();
    if (canvas) drawBoard(canvas, engine);
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      engine.pause();
      keyboard.clear();
    } else {
      last = performance.now();
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
