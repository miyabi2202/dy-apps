import {
  type Board,
  pick,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import type { ChopperScheme } from './chopper';
import { Mission } from './mission';
import { helicopterPortrait } from './portrait';
import { HELICOPTER_SHADERS } from './shader';

/** Paint schemes: the body, then the stripe along it. Rescue orange is the first. */
export const HELICOPTER_SCHEMES: readonly ChopperScheme[] = [
  { body: '#ff7a24', stripe: '#fcd53f' },
  // Police blue and white.
  { body: '#2563eb', stripe: '#f8fafc' },
  // Rescue red.
  { body: '#dc2626', stripe: '#fde68a' },
  // Army green.
  { body: '#4d7c0f', stripe: '#facc15' },
  // News-chopper white with a red stripe.
  { body: '#f1f5f9', stripe: '#ef4444' },
  // Pink.
  { body: '#ec4899', stripe: '#fdf2f8' },
];

interface Options {
  /** The schemes to pick from for each trip; the first until the first pick. */
  schemes?: readonly ChopperScheme[];
}

/**
 * A helicopter that hovers over the pile and sends a winchman down to vacuum it up (see
 * `Mission`), then flies off.
 */
export class Helicopter implements Remover {
  readonly name = 'helicopter';
  /** Compiled when the page opens. */
  readonly shaders = HELICOPTER_SHADERS;
  /** Its cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly schemes: readonly ChopperScheme[];

  constructor({ schemes = HELICOPTER_SCHEMES }: Options = {}) {
    this.schemes = schemes;
    this.sprites = schemes.map(({ body, stripe }) => helicopterPortrait(body, stripe));
  }

  /** The pile's outer layer, all across, then the next one down: what he walks over and vacuums. */
  shape(): ScoopShape {
    return { kind: 'layers' };
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Mission(board, now, rng, pick(this.schemes, rng));
  }
}
