import * as stylex from '@stylexjs/stylex';
import type { CurseDef } from '../core/curses';
import { RARITY_COLORS } from './rarity';

/** A curse's name in its rarity's colour. */
export function CurseName({ def }: { def: CurseDef<unknown> }) {
  return (
    <span
      {...stylex.props(styles.name, styles.tint(RARITY_COLORS[def.rarity]))}
      data-rarity={def.rarity}
    >
      {def.name}
    </span>
  );
}

const styles = stylex.create({
  name: {
    fontWeight: 600,
  },
  tint: (color: string) => ({ color }),
});
