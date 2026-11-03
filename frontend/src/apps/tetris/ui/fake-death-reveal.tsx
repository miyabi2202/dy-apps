import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { Sender } from '../core/types';
import { CONFIG } from '../core/config';
import { testIds } from '../messages';
import { SenderBadge } from './sender-badge';

/** 骗你的 only flashes, so it lands big and tilted, already in full view. */
const slam = stylex.keyframes({
  '0%': { transform: 'scale(1.5) rotate(-8deg)' },
  '100%': { transform: 'scale(1) rotate(0deg)' },
});

/** The end of a 假死: 骗你的, signed by whoever sent it, as the fake wall falls away. */
export function FakeDeathReveal({ sender }: { sender: Sender | null }) {
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.fakeDeathReveal}>
      <strong {...stylex.props(styles.title, styles.flash(CONFIG.fakeDeath.revealMs))}>
        骗你的！
      </strong>
      {sender && (
        <span {...stylex.props(styles.by)}>
          —— by <SenderBadge sender={sender} xstyle={styles.sender} />
        </span>
      )}
    </div>
  );
}

const styles = stylex.create({
  root: {
    inset: 0,
    gap: space.sm,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    pointerEvents: 'none',
    position: 'absolute',
    textAlign: 'center',
  },
  title: {
    animationName: slam,
    animationTimingFunction: 'ease-out',
    color: colors.warn,
    fontSize: 44,
    fontWeight: 900,
    textShadow: `0 0 4px ${colors.bg}, 0 0 14px ${colors.bg}, 0 3px 0 ${colors.danger}`,
  },
  /** The slam lasts as long as 骗你的 shows: it only flashes. */
  flash: (ms: number) => ({
    animationDuration: `${ms}ms`,
  }),
  by: {
    gap: space.xs,
    paddingInline: space.sm,
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.md,
    fontWeight: 700,
    textShadow: `0 0 4px ${colors.bg}, 0 0 10px ${colors.bg}`,
    maxWidth: '100%',
  },
  sender: {
    minWidth: 0,
  },
});
