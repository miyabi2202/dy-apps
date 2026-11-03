import { hueFor } from '@dy-apps/services';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { PossessCommand, PossessView } from '../core/room/possession';
import { testIds } from '../messages';
import { SenderBadge } from './sender-badge';

const GLYPHS: Record<PossessCommand, string> = { left: '←', right: '→', rotate: '↻' };

/** The card dropping in over the board. */
const dropIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(-24px) scale(0.9)' },
  '60%': { opacity: 1, transform: 'translateY(4px) scale(1.02)' },
  '100%': { transform: 'translateY(0) scale(1)' },
});

/** A queued move popping in. */
const popIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(0.3)' },
  '70%': { opacity: 1, transform: 'scale(1.25)' },
  '100%': { transform: 'scale(1)' },
});

/** The last seconds of the countdown throbbing. */
const throb = stylex.keyframes({
  '0%': { transform: 'scale(1)' },
  '30%': { transform: 'scale(1.25)' },
  '100%': { transform: 'scale(1)' },
});

/**
 * 夺舍's countdown over the board, which stays in view below it so chat can aim: what to type,
 * the time left and every queued move, coloured by who sent it.
 */
export function PossessPanel({ possession }: { possession: PossessView }) {
  const { steps, sender } = possession;
  const seconds = Math.ceil(possession.remainingMs / 1000);
  const last = steps.at(-1);
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.possess}>
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.head)}>
          <strong {...stylex.props(styles.title)}>夺舍！</strong>
          {sender && <SenderBadge sender={sender} suffix="送的" xstyle={styles.sender} />}
        </div>
        <div {...stylex.props(styles.prompt)}>
          <span>
            弹幕发 <b {...stylex.props(styles.key)}>左</b> <b {...stylex.props(styles.key)}>右</b>{' '}
            <b {...stylex.props(styles.key)}>转</b>
          </span>
          <span
            key={seconds}
            {...stylex.props(styles.seconds, seconds <= 5 && styles.hurry)}
            data-testid={testIds.possessSeconds}
          >
            {seconds}s
          </span>
        </div>
        <ol {...stylex.props(styles.steps)} aria-label="排好的操作">
          {steps.map((step) => (
            <li
              key={step.id}
              title={step.sender.name}
              {...stylex.props(styles.step(hueFor(step.sender.id)))}
            >
              {GLYPHS[step.command]}
            </li>
          ))}
          {steps.length === 0 && <li {...stylex.props(styles.empty)}>还没人操作…</li>}
        </ol>
        <div {...stylex.props(styles.foot)}>
          <span>
            {steps.length} / {CONFIG.possess.maxSteps} 步
          </span>
          {last && <SenderBadge sender={last.sender} suffix="刚加的" xstyle={styles.last} />}
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    insetInline: 0,
    paddingInline: space.xs,
    position: 'absolute',
    // Below the spawn rows, so the piece stays in view.
    top: '13%',
  },
  card: {
    padding: space.xs,
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 2,
    gap: space.xxs,
    animationDuration: '350ms',
    animationName: dropIn,
    animationTimingFunction: 'ease-out',
    backgroundColor: `color-mix(in srgb, ${colors.bg} 78%, transparent)`,
    boxShadow: `0 0 18px color-mix(in srgb, ${colors.accent} 50%, transparent)`,
    display: 'flex',
    flexDirection: 'column',
  },
  head: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    minWidth: 0,
  },
  title: {
    color: colors.accent,
    flexShrink: 0,
    fontSize: fontSize.lg,
    fontWeight: 900,
    letterSpacing: '0.08em',
  },
  sender: {
    fontSize: fontSize.xs,
    minWidth: 0,
  },
  prompt: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSize.sm,
    justifyContent: 'space-between',
  },
  key: {
    borderRadius: radius.sm,
    paddingInline: 4,
    backgroundColor: colors.accent,
    color: colors.onAccent,
  },
  seconds: {
    animationDuration: '400ms',
    animationName: throb,
    fontSize: fontSize.lg,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 900,
  },
  hurry: {
    color: colors.danger,
  },
  steps: {
    margin: 0,
    padding: 0,
    gap: 2,
    listStyle: 'none',
    display: 'flex',
    flexWrap: 'wrap',
    minHeight: 18,
  },
  step: (hue: number) => ({
    borderRadius: 3,
    alignItems: 'center',
    animationDuration: '250ms',
    animationName: popIn,
    backgroundColor: `hsl(${hue} 70% 45%)`,
    color: '#fff',
    display: 'flex',
    fontSize: 12,
    fontWeight: 900,
    justifyContent: 'center',
    lineHeight: 1,
    height: 17,
    width: 17,
  }),
  empty: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  foot: {
    gap: space.xs,
    alignItems: 'center',
    color: colors.muted,
    display: 'flex',
    fontSize: fontSize.xs,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  last: {
    minWidth: 0,
  },
});
