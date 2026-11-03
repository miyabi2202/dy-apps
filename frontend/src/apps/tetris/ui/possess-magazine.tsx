import { hueFor } from '@dy-apps/services';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { PossessCommand, PossessView } from '../core/room/possession';
import { testIds } from '../messages';

const GLYPHS: Record<PossessCommand, string> = { left: '←', right: '→', rotate: '↻' };

/** One slot of the magazine, chip and gap, in px. */
const SLOT = 24;
/** Slots in view; the rest wait below, out of sight. */
const SHOWN = 10;

/** The chambered command kicking as it fires. */
const kick = stylex.keyframes({
  '0%': { transform: 'scale(1.3)' },
  '100%': { transform: 'scale(1)' },
});

/**
 * 夺舍 playing out, beside the board on the left: chat's commands loaded like rounds in a
 * magazine, the next one at the top. Each one fired, the rest move up a slot. After the last
 * comes ↓, the soft drop, which stays until the piece lands.
 */
export function PossessMagazine({ possession }: { possession: PossessView }) {
  const { steps, played, stage } = possession;
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.possessMagazine}>
      <span {...stylex.props(styles.label)}>夺舍</span>
      <div {...stylex.props(styles.window)}>
        <ol {...stylex.props(styles.rounds(played))} aria-label="待执行的操作">
          {steps.map((step, i) => (
            <li
              key={step.id}
              title={step.sender.name}
              {...stylex.props(
                styles.round(hueFor(step.sender.id)),
                i === played && styles.chambered,
                i < played && styles.spent,
              )}
            >
              {GLYPHS[step.command]}
            </li>
          ))}
          <li
            key="drop"
            {...stylex.props(styles.round(0), styles.drop, stage === 'drop' && styles.chambered)}
          >
            ↓
          </li>
        </ol>
      </div>
      <span {...stylex.props(styles.count)}>
        {stage === 'drop' ? '软降' : `${steps.length - played}/${CONFIG.possess.maxSteps}`}
      </span>
    </div>
  );
}

const styles = stylex.create({
  root: {
    padding: 3,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    borderStyle: 'solid',
    borderWidth: 2,
    gap: space.xxs,
    alignItems: 'center',
    backgroundColor: colors.bg,
    boxShadow: `0 0 12px color-mix(in srgb, ${colors.accent} 50%, transparent)`,
    display: 'flex',
    flexDirection: 'column',
    marginInlineEnd: space.xs,
    position: 'absolute',
    right: '100%',
    top: '18%',
  },
  label: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: 900,
  },
  window: {
    overflow: 'hidden',
    height: SLOT * SHOWN,
    width: SLOT,
  },
  /** Spent rounds slide up out of the window. */
  rounds: (played: number) => ({
    margin: 0,
    padding: 0,
    gap: SLOT - 20,
    listStyle: 'none',
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    transform: `translateY(${-played * SLOT}px)`,
    transitionDuration: '80ms',
    transitionProperty: 'transform',
    transitionTimingFunction: 'ease-out',
  }),
  round: (hue: number) => ({
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: `hsl(${hue} 70% 45%)`,
    color: '#fff',
    display: 'flex',
    flexShrink: 0,
    fontSize: 13,
    fontWeight: 900,
    justifyContent: 'center',
    lineHeight: 1,
    height: 20,
    width: 20,
  }),
  chambered: {
    animationDuration: '120ms',
    animationName: kick,
    boxShadow: `0 0 0 2px ${colors.warn}`,
  },
  spent: {
    opacity: 0,
  },
  drop: {
    backgroundColor: colors.panelRaised,
    color: colors.warn,
  },
  count: {
    color: colors.muted,
    fontSize: 10,
    fontVariantNumeric: 'tabular-nums',
  },
});
