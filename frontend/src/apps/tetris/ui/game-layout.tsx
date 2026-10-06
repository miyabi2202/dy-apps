import { space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

const WIDE = '@media (min-width: 900px)';

/** The board, with the curses and gift wall beside it on wide screens and below it otherwise. */
export function GameLayout({ board, side }: { board: ReactNode; side: ReactNode }) {
  return (
    <main {...stylex.props(styles.columns)}>
      <div {...stylex.props(styles.board)}>{board}</div>
      <div {...stylex.props(styles.side)}>{side}</div>
    </main>
  );
}

const styles = stylex.create({
  columns: {
    gap: space.lg,
    gridTemplateAreas: {
      [WIDE]: '"board side"',
      default: '"board" "side"',
    },
    alignItems: 'start',
    display: 'grid',
    gridTemplateColumns: {
      [WIDE]: 'minmax(0, 520px) minmax(320px, 560px)',
      default: 'minmax(0, 1fr)',
    },
    justifyContent: 'center',
  },
  board: { gridArea: 'board', minWidth: 0 },
  side: { gridArea: 'side', minWidth: 0 },
});
