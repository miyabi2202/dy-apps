import { text } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { LikeMeterView } from '../core/game';
import { testIds } from '../messages';
import { SenderBadge } from './sender-badge';

const PINK = '#ff5fa2';

/** The heart giving a beat each time likes come in. */
const beat = stylex.keyframes({
  '0%': { transform: 'scale(1)' },
  '30%': { transform: 'scale(1.35)' },
  '100%': { transform: 'scale(1)' },
});

/**
 * The room's likes filling towards the next curse, and who has liked most this time: they get
 * the credit when it fills.
 */
export function LikeMeter({ meter }: { meter: LikeMeterView }) {
  const { likes, threshold, top } = meter;
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.likeMeter}>
      <div {...stylex.props(styles.head)}>
        <span key={likes} aria-hidden {...stylex.props(styles.heart)}>
          ♥
        </span>
        <span {...stylex.props(text.caption, styles.title)}>点赞满了送诅咒</span>
        <span {...stylex.props(styles.count)}>
          {likes} / {threshold}
        </span>
      </div>
      <div
        {...stylex.props(styles.track)}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={threshold}
        aria-valuenow={likes}
      >
        <div {...stylex.props(styles.fill(Math.min(1, likes / threshold)))} />
      </div>
      {top && (
        <div {...stylex.props(styles.top)}>
          <span {...stylex.props(text.muted)}>点得最多</span>
          <SenderBadge sender={top.sender} suffix={`${top.likes} 赞`} />
        </div>
      )}
    </div>
  );
}

const styles = stylex.create({
  root: {
    gap: space.xs,
    display: 'flex',
    flexDirection: 'column',
  },
  head: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
  },
  heart: {
    animationDuration: '300ms',
    animationName: beat,
    animationTimingFunction: 'ease-out',
    color: PINK,
    display: 'inline-block',
    fontSize: fontSize.md,
  },
  title: {
    flexGrow: 1,
  },
  count: {
    fontSize: fontSize.sm,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },
  track: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.panelRaised,
    height: 10,
  },
  fill: (k: number) => ({
    backgroundImage: `linear-gradient(90deg, #ff9ac8, ${PINK})`,
    boxShadow: `0 0 8px ${PINK}`,
    transitionDuration: '200ms',
    transitionProperty: 'width',
    height: '100%',
    width: `${k * 100}%`,
  }),
  top: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.sm,
  },
});
