import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalGiftAdapter } from './adapters/local-gift';
import { GameEngine } from './core/game';
import { KeyboardController } from './input/keyboard';
import { App } from './ui/App';
import './global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// `?seed=123` makes piece, garbage and gift randomness reproducible.
const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) : undefined;

const engine = new GameEngine({ seed });
const gifts = new LocalGiftAdapter(engine);
const keyboard = new KeyboardController(engine);

// Test/debug hook for browser tests and manual inspection.
(window as unknown as { __blockLab: unknown }).__blockLab = { engine, gifts };

createRoot(container).render(
  <StrictMode>
    <App engine={engine} gifts={gifts} keyboard={keyboard} />
  </StrictMode>,
);
