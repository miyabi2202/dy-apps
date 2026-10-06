import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import type { GameEngine } from '../core/game';
import type { KeyboardController } from '../input/keyboard';
import { startGameLoop } from '../loop';

/** Re-render when the engine reports a panel-relevant change. */
export function useEngineVersion(engine: GameEngine): number {
  return useSyncExternalStore(engine.subscribe, engine.getVersion);
}

/**
 * Runs the game while mounted: keyboard input, the frame loop and re-renders. Returns the
 * ref for the board canvas.
 */
export function usePlay(
  engine: GameEngine,
  keyboard: KeyboardController,
): RefObject<HTMLCanvasElement | null> {
  useEngineVersion(engine);
  const boardRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => keyboard.attach(window), [keyboard]);
  useEffect(() => startGameLoop(engine, keyboard, () => boardRef.current), [engine, keyboard]);
  return boardRef;
}
