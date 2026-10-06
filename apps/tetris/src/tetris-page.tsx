import { useEffect, useState } from 'react';
import { readConfig, type TetrisConfig } from './config';
import { GameEngine } from './core/game';
import { GiftFeed } from './gift-feed';
import { KeyboardController } from './input/keyboard';
import { App } from './ui/app';
import { ObsView } from './ui/obs-view';
import type { CreateDyhubClient } from './use-live-gifts';

/** `?seed=123` makes piece, garbage and gift randomness reproducible. */
function seedFromUrl(): number | undefined {
  const seed = new URLSearchParams(window.location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? Number(seed) : undefined;
}

interface PageOptions {
  /** `?obs=1`: what viewers see, for an OBS browser source. */
  obs: boolean;
  /** From the URL where it says, otherwise what was saved last time. */
  config: TetrisConfig;
}

function optionsFromUrl(): PageOptions {
  const { search } = window.location;
  return { obs: new URLSearchParams(search).get('obs') === '1', config: readConfig(search) };
}

function createGame({ probability }: TetrisConfig) {
  const engine = new GameEngine({ seed: seedFromUrl(), probability });
  const feed = new GiftFeed(engine);
  return { engine, feed, keyboard: new KeyboardController(engine) };
}

interface Props {
  /** Swapped for a fake in tests. */
  createClient?: CreateDyhubClient;
}

/**
 * The 方块干预实验室 route: the config page with the game as a preview, or (`?obs=1`) the
 * game and gift wall for OBS. A fresh game starts each time the page mounts.
 */
export function TetrisPage({ createClient }: Props) {
  const [{ obs, config }] = useState(optionsFromUrl);
  const [{ engine, feed, keyboard }] = useState(() => createGame(config));

  // Test/debug hook for browser tests and manual inspection.
  useEffect(() => {
    const w = window as unknown as { __blockLab?: unknown };
    w.__blockLab = { engine, feed };
    return () => {
      delete w.__blockLab;
    };
  }, [engine, feed]);

  if (obs) {
    return (
      <ObsView
        engine={engine}
        feed={feed}
        keyboard={keyboard}
        config={config}
        createClient={createClient}
      />
    );
  }
  return (
    <App
      engine={engine}
      feed={feed}
      keyboard={keyboard}
      config={config}
      createClient={createClient}
    />
  );
}
