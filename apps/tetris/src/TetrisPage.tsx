import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { LocalGiftAdapter } from './adapters/local-gift';
import { GameEngine } from './core/game';
import { KeyboardController } from './input/keyboard';
import { App } from './ui/App';
import { colors } from './ui/tokens.stylex';

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

  useEffect(() => {
    document.title = '方块干预实验室';
  }, []);

  return (
    <div {...stylex.props(styles.root)}>
      <App engine={engine} gifts={gifts} keyboard={keyboard} />
    </div>
  );
}

const styles = stylex.create({
  // Full-bleed dark background; the game's own page column is centred inside.
  root: {
    backgroundColor: colors.bg,
    colorScheme: 'dark',
    minHeight: '100vh',
  },
});
