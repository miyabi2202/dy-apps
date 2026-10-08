import { type Board, pick, type Removal, type Remover, type ScoopShape } from '../board';
import { Run } from './run';

/** Pac-Man's yellow and the ghost chasing him. */
export interface PacManPalette {
  pac: string;
  ghost: string;
}

export const PAC_MAN_PALETTES: readonly PacManPalette[] = [
  // Blinky, Pinky, Inky and Clyde.
  { pac: '#FACC15', ghost: '#EF4444' },
  { pac: '#FACC15', ghost: '#F9A8D4' },
  { pac: '#FACC15', ghost: '#22D3EE' },
  { pac: '#FACC15', ghost: '#FB923C' },
];

interface Options {
  /** The colours to pick from for each run; the first until the first pick. */
  palettes?: readonly PacManPalette[];
}

/**
 * Pac-Man eats his way through the pile, row by row, with a ghost on his heels, until he has
 * eaten all the board's icons; then the ghost catches him and the ones to drop back burst out
 * of him, or, with none to drop, he runs off (see `Run`).
 */
export class PacMan implements Remover {
  readonly name = 'pac-man';
  private readonly palettes: readonly PacManPalette[];

  constructor({ palettes = PAC_MAN_PALETTES }: Options = {}) {
    this.palettes = palettes;
  }

  /** The pile's outer layer, all across, then the next one down: just what he meets along his rows. */
  shape(): ScoopShape {
    return { kind: 'layers' };
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    return new Run(board, now, rng, pick(this.palettes, rng));
  }
}
