import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import type { CurseDef, EffectType } from '../core/curses';
import type { BoardNotice } from '../core/game';
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
 * by clearing lines or with a combo, one the game drew because the room was quiet, one the
 * full like meter drew, or one showing itself mid-play (画饼, 热心, a 钉子户 moving out). Each animates once, when it is new. During a cutscene they move to the bottom, clear of
 * the banner.
 */
export function BoardNotices({
  notices,
  curseOf,
  belowCutscene,
}: {
  notices: readonly BoardNotice[];
  curseOf: (type: EffectType) => CurseDef<unknown>;
  /** A cutscene is on: keep clear of its banner. */
  belowCutscene: boolean;
}) {
  return (
    <div {...stylex.props(styles.root, belowCutscene && styles.belowCutscene)} aria-live="polite">
      {notices.map((notice) => (
        <Notice key={notice.id} notice={notice} def={curseOf(notice.type)} />
      ))}
    </div>
  );
}

function Notice({ notice, def }: { notice: BoardNotice; def: CurseDef<unknown> }) {
  const cancelled = notice.kind === 'cancelled' || notice.kind === 'combo';
  const { headline, lead, look } = {
    cancelled: { headline: `消 ${notice.lines} 行！`, lead: '抵消 ', look: styles.cancelled },
    combo: { headline: `连击 ×${notice.combo}！`, lead: '抵消 ', look: styles.combo },
    quiet: { headline: '太安静了…', lead: '系统送出 ', look: styles.quiet },
    likes: { headline: `点赞满 ${notice.likes}！`, lead: '', look: styles.likes },
    reveal: { headline: `${def.name}！`, lead: '', look: styles.reveal },
  }[notice.kind];
  const reveal = notice.kind === 'reveal';
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
      {reveal ? (
        <span {...stylex.props(styles.text)}>{notice.text ?? def.tagline}</span>
      ) : (
        <span>
          {lead}
          <span {...stylex.props(styles.name)}>
            <CurseName def={def} />
            {cancelled && <span aria-hidden {...stylex.props(styles.strike)} />}
          </span>
        </span>
      )}
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
  combo: {
    borderColor: '#fbbf24',
    backgroundColor: `color-mix(in srgb, #fbbf24 22%, ${colors.bg})`,
    boxShadow: '0 0 16px color-mix(in srgb, #fbbf24 60%, transparent)',
  },
  likes: {
    borderColor: '#ff5fa2',
    backgroundColor: `color-mix(in srgb, #ff5fa2 22%, ${colors.bg})`,
    boxShadow: '0 0 16px color-mix(in srgb, #ff5fa2 60%, transparent)',
  },
  /** A curse showing itself mid-play: it got you. */
  reveal: {
    borderColor: colors.danger,
    backgroundColor: `color-mix(in srgb, ${colors.danger} 22%, ${colors.bg})`,
    boxShadow: `0 0 16px color-mix(in srgb, ${colors.danger} 60%, transparent)`,
  },
  text: {
    fontWeight: 700,
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
