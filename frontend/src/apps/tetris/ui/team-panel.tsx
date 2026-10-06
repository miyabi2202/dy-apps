import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { GameEngine } from '../core/game';
import type { GiftFeed } from '../gift-feed';
import { testIds } from '../messages';
import { CurseName } from './curse-name';
import { GiftWall } from './gift-wall';

interface Props {
  engine: GameEngine;
  feed: GiftFeed;
}

export function TeamPanel({ engine, feed }: Props) {
  const pending = engine.curses.filter((def) => engine.team.pending[def.type] > 0);

  return (
    <Panel aria-label="诅咒" data-testid={testIds.panelTeam} xstyle={styles.panel}>
      <h3 {...stylex.props(text.caption)}>待执行诅咒</h3>
      {pending.length ? (
        <ul {...stylex.props(styles.pending)} data-testid={testIds.pending}>
          {pending.map((def) => (
            <li key={def.type} {...stylex.props(styles.pendingItem)}>
              <CurseName def={def} />
              <span {...stylex.props(styles.pendingCount)}>×{engine.team.pending[def.type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p {...stylex.props(text.muted, styles.flush)} data-testid={testIds.pending}>
          暂无
        </p>
      )}

      <h3 {...stylex.props(text.caption)}>送礼记录</h3>
      <GiftWall feed={feed} />
    </Panel>
  );
}

const styles = stylex.create({
  panel: {
    borderTopColor: colors.danger,
    borderTopWidth: 4,
  },
  flush: {
    margin: 0,
  },
  pending: {
    margin: 0,
    padding: 0,
    gap: space.xs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
  },
  pendingItem: {
    borderRadius: radius.sm,
    paddingBlock: space.sm,
    paddingInline: space.md,
    backgroundColor: colors.panelRaised,
    display: 'flex',
    fontSize: fontSize.lg,
    justifyContent: 'space-between',
  },
  pendingCount: {
    color: colors.danger,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
});
