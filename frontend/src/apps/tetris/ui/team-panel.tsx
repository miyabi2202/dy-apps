import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { EFFECT_POOL } from '../core/config';
import type { GameEngine } from '../core/game';
import type { GiftFeed } from '../gift-feed';
import { effectName } from './format';
import { GiftWall } from './gift-wall';

interface Props {
  engine: GameEngine;
  feed: GiftFeed;
}

export function TeamPanel({ engine, feed }: Props) {
  const pending = EFFECT_POOL.filter((type) => engine.team.pending[type] > 0);

  return (
    <Panel aria-label="诅咒" data-testid="panel-team" xstyle={styles.panel}>
      <h3 {...stylex.props(text.caption)}>待执行诅咒</h3>
      {pending.length ? (
        <ul {...stylex.props(styles.pending)} data-testid="pending">
          {pending.map((type) => (
            <li key={type} {...stylex.props(styles.pendingItem)}>
              <span>{effectName(type)}</span>
              <span {...stylex.props(styles.pendingCount)}>×{engine.team.pending[type]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p {...stylex.props(text.muted, styles.flush)} data-testid="pending">
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
