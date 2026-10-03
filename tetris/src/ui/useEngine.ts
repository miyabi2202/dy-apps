import { useSyncExternalStore } from 'react';
import type { GameEngine } from '../core/game';

/** Re-render when the engine reports a panel-relevant change. */
export function useEngineVersion(engine: GameEngine): number {
  return useSyncExternalStore(engine.subscribe, engine.getVersion);
}
