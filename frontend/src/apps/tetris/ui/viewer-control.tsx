import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { GameEngine, ViewerCommand, ViewerInput } from '../core/game';
import { testIds } from '../messages';

const ARROWS: Record<ViewerCommand, string> = { left: '←', right: '→', rotate: '↻' };

/** The banner's command words glowing in turn, so it reads as "type one of these". */
const pulse = stylex.keyframes({
  '0%': { transform: 'scale(1)' },
  '15%': { transform: 'scale(1.25)' },
  '30%': { transform: 'scale(1)' },
  '100%': { transform: 'scale(1)' },
});

/** A viewer's command popping in from the side, then fading away so they never pile up. */
const popIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateX(-16px) scale(0.7)' },
  '8%': { opacity: 1, transform: 'translateX(0) scale(1.1)' },
  '16%': { transform: 'translateX(0) scale(1)' },
  '75%': { opacity: 1 },
  '100%': { opacity: 0, transform: 'translateX(0) scale(1)' },
});

/**
 * While viewers steer the piece (夺舍): a banner over the board saying which words to type, and
 * under it each viewer's command as it lands, with their name, so the room sees who pushed it
 * where. They fade after a moment, clear of the stack at the bottom.
 */
export function ViewerControl({ engine }: { engine: GameEngine }) {
  const by = engine.viewerControlBy;
  if (!by || !engine.active || engine.phase === 'gameOver') return null;
  const words = CONFIG.viewerCommands;
  const commands = Object.keys(words) as ViewerCommand[];
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.viewerControl}>
      <div {...stylex.props(styles.banner)}>
        <span>弹幕</span>
        {commands.map((c, i) => (
          <span key={c} {...stylex.props(styles.word, styles.delay(i * 400))}>
            {words[c]}
          </span>
        ))}
      </div>
      <ol {...stylex.props(styles.inputs)} aria-live="polite">
        {engine.viewerInputs.map((input) => (
          <Input key={input.id} input={input} />
        ))}
      </ol>
    </div>
  );
}

function Input({ input }: { input: ViewerInput }) {
  return (
    <li
      {...stylex.props(styles.input, !input.worked && styles.stuck)}
      data-testid={testIds.viewerInput}
    >
      <span {...stylex.props(styles.user)}>{input.user}</span>
      <span {...stylex.props(styles.arrow)}>{ARROWS[input.command]}</span>
    </li>
  );
}

const styles = stylex.create({
  root: {
    inset: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  banner: {
    borderColor: colors.accent,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 2,
    gap: space.xs,
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    alignItems: 'center',
    backgroundColor: `color-mix(in srgb, ${colors.accent} 22%, ${colors.bg})`,
    boxShadow: `0 0 14px color-mix(in srgb, ${colors.accent} 55%, transparent)`,
    display: 'flex',
    fontSize: fontSize.xs,
    fontWeight: 700,
    justifyContent: 'center',
    position: 'absolute',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    left: '50%',
    top: space.xs,
  },
  word: {
    borderRadius: radius.sm,
    paddingInline: space.xs,
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
    animationName: pulse,
    backgroundColor: colors.accent,
    color: colors.bg,
    display: 'inline-block',
    fontSize: fontSize.sm,
    fontWeight: 900,
  },
  delay: (ms: number) => ({ animationDelay: `${ms}ms` }),
  inputs: {
    margin: 0,
    padding: 0,
    gap: space.xxs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    top: 36,
  },
  input: {
    borderRadius: radius.sm,
    gap: space.xs,
    paddingInline: space.xs,
    alignItems: 'center',
    alignSelf: 'flex-start',
    animationDuration: '2s',
    animationFillMode: 'both',
    animationName: popIn,
    animationTimingFunction: 'ease-out',
    backgroundColor: `color-mix(in srgb, ${colors.bg} 80%, transparent)`,
    display: 'flex',
    fontSize: fontSize.xs,
    maxWidth: '100%',
  },
  /** Against a wall: it reached the piece but couldn't move it. */
  stuck: {
    opacity: 0.5,
  },
  user: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  arrow: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: 900,
  },
});
