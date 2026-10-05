import { useEffect, useState } from 'react';
import { LocalGiftAdapter } from './adapters/local-gift';
import { GameEngine } from './core/game';
import { KeyboardController } from './input/keyboard';
import { App } from './ui/app';

/** `?seed=123` makes piece, garbage and gift randomness reproducible. */
function seedFromUrl(): number | undefined {
  const seed = new URLSearchParams(window.location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? Number(seed) : undefined;
}

function createGame() {
  const engine = new GameEngine({ seed: seedFromUrl() });
  return { engine, gifts: new LocalGiftAdapter(engine), keyboard: new KeyboardController(engine) };
}

/** The 方块干预实验室 route. A fresh game starts each time the page mounts. */
export function TetrisPage() {
  const [{ engine, gifts, keyboard }] = useState(createGame);

  // Test/debug hook for browser tests and manual inspection.
  useEffect(() => {
    const w = window as unknown as { __blockLab?: unknown };
    w.__blockLab = { engine, gifts };
    return () => {
      delete w.__blockLab;
    };
  }, [engine, gifts]);

  return <App engine={engine} gifts={gifts} keyboard={keyboard} />;
}
