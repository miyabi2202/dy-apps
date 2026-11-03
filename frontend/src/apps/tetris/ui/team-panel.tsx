import { Panel, text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { LikeMeterView, PendingCurse } from '../core/game';
import type { GiftFeed } from '../gift-feed';
import { testIds } from '../messages';
import { CurseName } from './curse-name';
import { GiftWall } from './gift-wall';
import { LikeMeter } from './like-meter';

interface Props {
  /** The curses waiting to settle. */
  pending: readonly PendingCurse[];
  likes: LikeMeterView;
  feed: GiftFeed;
}

/**
 * The curse side: the like meter, the curses waiting to settle (the first few, then …) and the
 * gift wall.
 */
export function TeamPanel({ pending, likes, feed }: Props) {
  return (
    <Panel aria-label="诅咒" data-testid={testIds.panelTeam} xstyle={styles.panel}>
      <LikeMeter meter={likes} />
      <h3 {...stylex.props(text.caption)}>待执行诅咒</h3>
      {pending.length ? (
        <ul {...stylex.props(styles.pending)} data-testid={testIds.pending}>
          {pending.slice(0, CONFIG.pendingShown).map(({ def, count }) => (
            <li key={def.type} {...stylex.props(styles.pendingItem)}>
              <CurseName def={def} />
              <span {...stylex.props(styles.pendingCount)}>×{count}</span>
            </li>
          ))}
          {pending.length > CONFIG.pendingShown && (
            <li {...stylex.props(styles.pendingItem, styles.more)}>
              <span>…</span>
              <span>还有 {pending.length - CONFIG.pendingShown} 种</span>
            </li>
          )}
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
  more: {
    color: colors.muted,
  },
  pendingCount: {
    color: colors.danger,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
});
