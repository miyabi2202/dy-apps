import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { BoardNotice, GameEngine } from '../core/game';
import { testIds } from '../messages';
import { CurseName } from './curse-name';
import { SenderBadge } from './sender-badge';

/** Pops in, holds, then floats up and fades; it stays invisible afterwards. */
const floatAway = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(12px) scale(0.6)' },
  '12%': { opacity: 1, transform: 'translateY(0) scale(1.12)' },
  '20%': { transform: 'translateY(0) scale(1)' },
  '75%': { opacity: 1, transform: 'translateY(0) scale(1)' },
  '100%': { opacity: 0, transform: 'translateY(-28px) scale(1)' },
});

/** A line struck through the cancelled curse's name. */
const strike = stylex.keyframes({
  '0%': { transform: 'scaleX(0)' },
  '100%': { transform: 'scaleX(1)' },
});

/**
 * Short notices over the top of the board that don't stop play: a curse the player cancelled
 * by clearing lines, one the game drew because the room was quiet, or one the full like meter
 * drew. Each animates once, when it is new. During a cutscene they move to the bottom, clear of
 * the banner.
 */
export function BoardNotices({ engine }: { engine: GameEngine }) {
  return (
    <div {...stylex.props(styles.root, engine.cutscene && styles.belowCutscene)} aria-live="polite">
      {engine.notices.map((notice) => (
        <Notice key={notice.id} notice={notice} engine={engine} />
      ))}
    </div>
  );
}

function Notice({ notice, engine }: { notice: BoardNotice; engine: GameEngine }) {
  const def = engine.curses.find((d) => d.type === notice.type)!;
  const cancelled = notice.kind === 'cancelled';
  const { headline, lead, look } = {
    cancelled: { headline: `消 ${notice.lines} 行！`, lead: '抵消 ', look: styles.cancelled },
    quiet: { headline: '太安静了…', lead: '系统送出 ', look: styles.quiet },
    likes: { headline: `点赞满 ${notice.likes}！`, lead: '', look: styles.likes },
  }[notice.kind];
  return (
    <div {...stylex.props(styles.notice, look)} data-testid={testIds.notice(notice.kind)}>
      <span {...stylex.props(styles.headline)}>{headline}</span>
      {notice.sender && (
        <SenderBadge
          sender={notice.sender}
          suffix={notice.kind === 'likes' ? '送出' : '送的'}
          xstyle={styles.sender}
        />
      )}
      <span>
        {lead}
        <span {...stylex.props(styles.name)}>
          <CurseName def={def} />
          {cancelled && <span aria-hidden {...stylex.props(styles.strike)} />}
        </span>
      </span>
    </div>
  );
}

const styles = stylex.create({
  root: {
    gap: space.xs,
    insetInline: 0,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'none',
    position: 'absolute',
    top: '18%',
  },
  belowCutscene: {
    bottom: '6%',
    top: 'auto',
  },
  notice: {
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 2,
    paddingBlock: space.xs,
    paddingInline: space.md,
    alignItems: 'center',
    animationDuration: '1.8s',
    animationFillMode: 'both',
    animationName: floatAway,
    animationTimingFunction: 'ease-out',
    display: 'flex',
    flexDirection: 'column',
    fontSize: fontSize.sm,
    lineHeight: 1.4,
    textAlign: 'center',
    maxWidth: '94%',
  },
  cancelled: {
    borderColor: colors.success,
    backgroundColor: `color-mix(in srgb, ${colors.success} 22%, ${colors.bg})`,
    boxShadow: `0 0 16px color-mix(in srgb, ${colors.success} 60%, transparent)`,
  },
  likes: {
    borderColor: '#ff5fa2',
    backgroundColor: `color-mix(in srgb, #ff5fa2 22%, ${colors.bg})`,
    boxShadow: '0 0 16px color-mix(in srgb, #ff5fa2 60%, transparent)',
  },
  quiet: {
    borderColor: colors.warn,
    backgroundColor: `color-mix(in srgb, ${colors.warn} 22%, ${colors.bg})`,
    boxShadow: `0 0 16px color-mix(in srgb, ${colors.warn} 60%, transparent)`,
  },
  headline: {
    fontSize: fontSize.md,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  sender: {
    fontSize: fontSize.xs,
  },
  name: {
    display: 'inline-block',
    position: 'relative',
  },
  strike: {
    animationDelay: '300ms',
    animationDuration: '300ms',
    animationFillMode: 'both',
    animationName: strike,
    animationTimingFunction: 'ease-out',
    backgroundColor: colors.success,
    position: 'absolute',
    transformOrigin: 'left',
    height: 2,
    left: -2,
    right: -2,
    top: '50%',
  },
});
