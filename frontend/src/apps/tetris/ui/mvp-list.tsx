import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { MvpEntry } from '../core/room/mvp-board';
import { testIds } from '../messages';
import { SenderBadge } from './sender-badge';

const MEDALS = ['🥇', '🥈', '🥉'];
/** Marks the viewer whose curse ended the game. */
const FINAL_BLOW = '💀';

/** Game over's MVP board: the viewers whose curses hurt most, with whose curse ended it. */
export function MvpList({ entries }: { entries: readonly MvpEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section {...stylex.props(styles.root)} data-testid={testIds.mvp}>
      <strong {...stylex.props(styles.title)}>MVP</strong>
      <ol {...stylex.props(styles.list)}>
        {entries.slice(0, CONFIG.mvp.shown).map((entry, i) => (
          <li key={entry.sender.id} {...stylex.props(styles.row, i === 0 && styles.first)}>
            <span {...stylex.props(styles.rank)}>{MEDALS[i] ?? i + 1}</span>
            <SenderBadge
              sender={entry.sender}
              suffix={entry.finalBlow ? FINAL_BLOW : undefined}
              xstyle={styles.sender}
            />
            <span {...stylex.props(styles.points)}>{entry.points}</span>
          </li>
        ))}
      </ol>
      {entries.some((e) => e.finalBlow) && (
        <span {...stylex.props(styles.legend)}>{FINAL_BLOW} 最后一击</span>
      )}
    </section>
  );
}

const styles = stylex.create({
  root: {
    gap: space.xxs,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  title: {
    color: colors.warn,
    fontSize: fontSize.sm,
    letterSpacing: '0.12em',
  },
  list: {
    margin: 0,
    padding: 0,
    gap: 2,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    borderRadius: radius.sm,
    gap: space.xxs,
    paddingBlock: 2,
    paddingInline: space.xxs,
    alignItems: 'center',
    backgroundColor: colors.panelRaised,
    display: 'flex',
    fontSize: fontSize.xs,
    textAlign: 'left',
  },
  first: {
    boxShadow: `inset 0 0 0 1px ${colors.warn}`,
  },
  rank: {
    flexShrink: 0,
    textAlign: 'center',
    minWidth: '1.4em',
  },
  sender: {
    flexGrow: 1,
    minWidth: 0,
  },
  legend: {
    color: colors.muted,
    fontSize: 10,
  },
  points: {
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
});
