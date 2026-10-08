import { type Board, pick, type Removal, type Remover, type ScoopShape } from '../board';
import { type Recolour, SvgArt } from '../kit/svg-art';
import { HELICOPTER_SVG } from './art';
import { Mission } from './mission';

/**
 * Paint schemes, by the art's own fills: the body and skids (`#FF822D`), the tail boom
 * (`#FFB02E`) and the stripe (`#FCD53F`). The art's orange is the first.
 */
export const HELICOPTER_SCHEMES: readonly Recolour[] = [
  {},
  // Police blue and white.
  { '#FF822D': '#2563EB', '#FFB02E': '#3B82F6', '#FCD53F': '#F8FAFC' },
  // Rescue red.
  { '#FF822D': '#DC2626', '#FFB02E': '#EF4444', '#FCD53F': '#FDE68A' },
  // Army green.
  { '#FF822D': '#4D7C0F', '#FFB02E': '#65A30D', '#FCD53F': '#FACC15' },
  // News-chopper white with a red stripe.
  { '#FF822D': '#F1F5F9', '#FFB02E': '#CBD5E1', '#FCD53F': '#EF4444' },
  // Pink.
  { '#FF822D': '#EC4899', '#FFB02E': '#F472B6', '#FCD53F': '#FDF2F8' },
];

interface Options {
  /** The schemes to pick from for each trip; the first until the first pick. */
  schemes?: readonly Recolour[];
}

/**
 * A helicopter that hovers over the pile and sends a winchman down to vacuum it up (see
 * `Mission`), then flies off.
 */
export class Helicopter implements Remover {
  readonly name = 'helicopter';
  private readonly art: SvgArt;
  private readonly schemes: readonly Recolour[];

  constructor({ schemes = HELICOPTER_SCHEMES }: Options = {}) {
    this.schemes = schemes;
    this.art = new SvgArt(HELICOPTER_SVG, schemes);
  }

  load(): Promise<void> {
    return this.art.load();
  }

  /** The pile's outer layer, all across, then the next one down: what he walks over and vacuums. */
  shape(): ScoopShape {
    return { kind: 'layers' };
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Mission(board, now, rng, this.art, pick(this.schemes, rng));
  }
}
