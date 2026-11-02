import { fog } from './fog';
import { garbage } from './garbage';
import { haste } from './haste';
import { hasty } from './hasty';
import { mirror } from './mirror';
import { noRotate } from './no-rotate';
import { rockfall } from './rockfall';
import { seal } from './seal';
import { slip } from './slip';
import { snakes } from './snakes';
import { spin } from './spin';
import { swap } from './swap';
import { twin } from './twin';
import type { CurseDef } from './types';

/**
 * Every curse, in settlement order; each key matches its curse's `type`. A gift draws among
 * the engine's curses by rarity (gifts.ts); adding a curse here adds it to the default list,
 * the rules text and the panels.
 */
const registry = {
  garbage,
  haste,
  fog,
  seal,
  noRotate,
  spin,
  swap,
  snakes,
  rockfall,
  hasty,
  slip,
  mirror,
  twin,
} satisfies Record<string, CurseDef<unknown, string>>;

export type EffectType = keyof typeof registry;

/** The registry; the annotation checks each curse's `type` matches its key. */
export const CURSES: { readonly [K in EffectType]: CurseDef<unknown, K> } = registry;

/** Every curse in registry order: the engine's default `curses`. */
export const CURSE_LIST: readonly CurseDef<unknown>[] = Object.values(CURSES);

/** Every curse type in registry order. What a game has in play is `engine.curses`. */
export const EFFECT_POOL: readonly EffectType[] = CURSE_LIST.map((def) => def.type);

export { defineCurse, RARITIES } from './types';
export type { Command, CurseContext, CurseDef, CurseOutcome, Rarity } from './types';
