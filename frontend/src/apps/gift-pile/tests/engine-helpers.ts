import RAPIER from '@dimforge/rapier2d-compat';
import { PILE, type PileSettings } from '../core/config';
import { PileEngine } from '../core/engine';
import { mulberry32 } from './helpers';

// Rapier needs Node's globals (TextDecoder, WebAssembly), so tests using this run with
// `@jest-environment node`.

/** The WASM module, initialised once for all tests. */
const rapier = RAPIER.init().then(() => RAPIER);

/** An engine on a small world, so piles settle in few steps. */
export async function createEngine(
  settings: Partial<PileSettings> = {},
  seed = 1,
): Promise<PileEngine> {
  return new PileEngine({
    rapier: await rapier,
    settings: { ...PILE, world: { width: 200, height: 300 }, ...settings },
    rng: mulberry32(seed),
  });
}

/** Steps until nothing is queued or moving, or `maxSeconds` of simulation have passed. */
export function settle(engine: PileEngine, maxSeconds = 30): void {
  const maxSteps = maxSeconds * PILE.stepHz;
  for (let s = 0; s < maxSteps && (engine.queued > 0 || engine.movingCount > 0); s++) {
    engine.step();
  }
}
