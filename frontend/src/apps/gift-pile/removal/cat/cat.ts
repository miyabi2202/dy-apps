import {
  type Board,
  pick,
  type Removal,
  type Remover,
  type ScoopShape,
  type SpriteSource,
} from '../board';
import { CAT_PALETTES, type CatPalette, headSprites } from './body';
import { buddySprites } from './buddy';
import { catPortrait } from './portrait';
import { CAT_SHADERS } from './shader';
import { Visit } from './visit';

interface Options {
  /** The coats to pick from for each visit; the first, the hero, comes three visits in four. */
  palettes?: readonly CatPalette[];
}

/**
 * A ginger street cat out in the neon city, with its drone buddy riding in the backpack on its
 * back, doing what cats do to things on tables: it walks in along the top of the pile, sits,
 * and stares at the viewer while it pushes a gift off the screen, tap by tap. Then, bored, it
 * sweeps and bats the rest off, until it loses interest in the duds, yawns, stretches and
 * saunters off (see `Visit`).
 */
export class Cat implements Remover {
  readonly name = 'cat';
  /** Compiled when the page opens. */
  readonly shaders = CAT_SHADERS;
  /** Its heads, for every face it pulls in every coat, its buddy's faces, and its cut-in portraits, painted ahead of time. */
  readonly sprites: readonly SpriteSource[];
  private readonly palettes: readonly CatPalette[];

  constructor({ palettes = CAT_PALETTES }: Options = {}) {
    this.palettes = palettes;
    this.sprites = [
      ...palettes.flatMap((palette) => [...headSprites(palette), catPortrait(palette)]),
      ...buddySprites(),
    ];
  }

  /** The pile's outer layer, all across, then the next one down: what it walks along and bats off. */
  shape(): ScoopShape {
    return { kind: 'layers' };
  }

  begin(board: Board, now: number, rng: () => number): Removal {
    const [hero, ...others] = this.palettes;
    const palette = others.length > 0 && rng() >= 0.75 ? pick(others, rng) : hero!;
    return new Visit(board, now, rng, palette);
  }
}
