import * as stylex from '@stylexjs/stylex';
import type { CurseDef, Rarity } from '../core/curses';
import { rarityColors } from './rarity.stylex';

/** A curse's name in its rarity's colour. */
export function CurseName({ def }: { def: CurseDef<unknown> }) {
  return (
    <span {...stylex.props(styles.name, byRarity[def.rarity])} data-rarity={def.rarity}>
      {def.name}
    </span>
  );
}

const styles = stylex.create({
  name: {
    fontWeight: 600,
  },
});

const byRarity: Record<Rarity, stylex.StyleXStyles> = stylex.create({
  common: { color: rarityColors.common },
  uncommon: { color: rarityColors.uncommon },
  rare: { color: rarityColors.rare },
});
