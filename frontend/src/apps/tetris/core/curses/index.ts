import { CONFIG } from '../config';
import { fog } from './fog';
import { garbage } from './garbage';
import { haste } from './haste';
import { seal } from './seal';
import type { CurseDef } from './types';

/**
 * Every curse, in settlement order; each key matches its curse's `type`. A gift draws one of
 * the engine's curses uniformly; adding a curse here adds it to the default list, the rules
 * text and the panels.
 */
const registry = {
  garbage,
  haste,
  fog,
  seal,
} satisfies Record<string, CurseDef<unknown, string>>;

export type EffectType = keyof typeof registry;

export type CurseRegistry = Readonly<Record<EffectType, CurseDef<unknown>>>;

/** The registry; the annotation checks each curse's `type` matches its key. */
export const CURSES: { readonly [K in EffectType]: CurseDef<unknown, K> } = registry;

/** Every curse in registry order: the engine's default `curses`. */
export const CURSE_LIST: readonly CurseDef<unknown>[] = Object.values(CURSES);

/** Every curse type in registry order. What a game has in play is `engine.curses`. */
export const EFFECT_POOL: readonly EffectType[] = CURSE_LIST.map((def) => def.type);

/** What one curse does when it fires. */
export const EFFECT_INFO: Record<EffectType, { name: string; description: string }> =
  Object.fromEntries(
    EFFECT_POOL.map((type) => [
      type,
      { name: CURSES[type].name, description: CURSES[type].description(CONFIG) },
    ]),
  ) as Record<EffectType, { name: string; description: string }>;

export { defineCurse } from './types';
export type { Command, CurseContext, CurseDef, CurseOutcome } from './types';
