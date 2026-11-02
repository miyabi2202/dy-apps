import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { CutsceneView } from '../core/game';
import { RARITIES } from '../core/curses';
import { labels, testIds } from '../messages';
import { CurseName } from './curse-name';
import { CUTSCENE_DEMOS } from './cutscene-demos';
import { RARITY_COLORS } from './rarity';
import { SenderBadge } from './sender-badge';

/** A band of light crossing the dimmed board as the cutscene opens. */
const sweep = stylex.keyframes({
  from: { transform: 'translateX(-100%)' },
  to: { transform: 'translateX(100%)' },
});

/** The banner sliding in from the left and overshooting a little. */
const slideIn = stylex.keyframes({
  '0%': { transform: 'translateX(-130%)' },
  '70%': { transform: 'translateX(6%)' },
  '100%': { transform: 'translateX(0)' },
});

/** The name arriving: it lands big, then settles. */
const slam = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(2.2)' },
  '35%': { opacity: 1, transform: 'scale(0.92)' },
  '100%': { transform: 'scale(1)' },
});

/** The tagline sliding up into place once the name has landed. */
const riseIn = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const turn = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

/** READY gathering in from the right, its letters pulling together. */
const gather = stylex.keyframes({
  '0%': { letterSpacing: '0.9em', opacity: 0, transform: 'translateX(40%)' },
  '60%': { letterSpacing: '0.02em', opacity: 1, transform: 'translateX(0)' },
  '100%': { letterSpacing: '0.06em', transform: 'translateX(0)' },
});

/** A ring tightening around READY. */
const closeIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(1.6)' },
  '40%': { opacity: 1 },
  '100%': { opacity: 0.8, transform: 'scale(1)' },
});

/** GO! slamming in and bouncing once. */
const punch = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(3)' },
  '30%': { opacity: 1, transform: 'scale(0.88)' },
  '45%': { transform: 'scale(1.1)' },
  '60%': { transform: 'scale(1)' },
  '100%': { transform: 'scale(1)' },
});

/** A shockwave bursting out from GO!. */
const burst = stylex.keyframes({
  '0%': { opacity: 0.9, transform: 'scale(0.5)' },
  '100%': { opacity: 0, transform: 'scale(2.8)' },
});

/** The banner and rays clearing away during GO!, uncovering the board. */
const clear = stylex.keyframes({
  from: { opacity: 1, transform: 'scale(1)' },
  to: { opacity: 0, transform: 'scale(0.94)' },
});

/**
 * A piece-changing curse's entrance over the board: a banner with its name and a demo of what
 * it does (or its rules, without a demo), then READY, then GO! as the banner clears. A rare one
 * gets light rays.
 */
export function Cutscene({ cutscene }: { cutscene: CutsceneView }) {
  const rarest = [...RARITIES]
    .reverse()
    .find((r) => cutscene.curses.some((def) => def.rarity === r))!;
  const color = RARITY_COLORS[rarest];
  const going = cutscene.stage === 'go';
  const { readyMs, goMs } = CONFIG.cutscene;
  return (
    <div
      {...stylex.props(styles.root, going && [styles.rootClear, styles.fades(goMs)])}
      data-testid={testIds.cutscene}
      data-rarity={rarest}
      data-stage={cutscene.stage}
    >
      {rarest === 'rare' && (
        <div
          aria-hidden
          {...stylex.props(styles.rays(color), going && [styles.clear, styles.lasts(goMs)])}
        />
      )}
      <div aria-hidden {...stylex.props(styles.sweep(color))} />
      <div {...stylex.props(styles.banner, going && [styles.clear, styles.lasts(goMs)])}>
        <div aria-hidden {...stylex.props(styles.bannerBg(color))} />
        {cutscene.curses.map((def, i) => {
          const Demo = CUTSCENE_DEMOS[def.type];
          const sender = cutscene.senders[i];
          return (
            <div key={def.type} {...stylex.props(styles.curse)}>
              {sender && <SenderBadge sender={sender} suffix="送出" xstyle={styles.sender} />}
              <strong {...stylex.props(styles.name, styles.glow(RARITY_COLORS[def.rarity]))}>
                <CurseName def={def} />
              </strong>
              {def.tagline && <span {...stylex.props(styles.tagline)}>{def.tagline}</span>}
              {Demo ? (
                <Demo />
              ) : (
                <span {...stylex.props(styles.rules)}>{def.description(CONFIG)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div {...stylex.props(styles.callSlot)}>
        {cutscene.stage === 'ready' && (
          <div
            key="ready"
            {...stylex.props(styles.call, styles.ready, styles.lasts(readyMs), styles.glow(color))}
          >
            <span aria-hidden {...stylex.props(styles.readyRing(color), styles.lasts(readyMs))} />
            {labels.cutscene.ready}
          </div>
        )}
        {going && (
          <div
            key="go"
            {...stylex.props(
              styles.call,
              styles.go,
              styles.lasts(goMs),
              styles.glow(colors.success),
            )}
          >
            <span aria-hidden {...stylex.props(styles.burst, styles.lasts(goMs))} />
            {labels.cutscene.go}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    inset: 0,
    gap: space.lg,
    overflow: 'hidden',
    alignItems: 'center',
    backdropFilter: 'blur(2px)',
    backgroundColor: `color-mix(in srgb, ${colors.bg} 78%, transparent)`,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    position: 'absolute',
    textAlign: 'center',
  },
  rays: (color: string) => ({
    animationDuration: '6s',
    animationIterationCount: 'infinite',
    animationName: turn,
    animationTimingFunction: 'linear',
    aspectRatio: '1',
    backgroundImage: `repeating-conic-gradient(color-mix(in srgb, ${color} 28%, transparent) 0deg 8deg, transparent 8deg 24deg)`,
    maskImage: 'radial-gradient(circle, black 10%, transparent 55%)',
    position: 'absolute',
    left: '50%',
    marginLeft: '-150%',
    marginTop: '-150%',
    top: '50%',
    width: '300%',
  }),
  sweep: (color: string) => ({
    inset: 0,
    animationDuration: '700ms',
    animationFillMode: 'both',
    animationName: sweep,
    animationTimingFunction: 'ease-in',
    backgroundImage: `linear-gradient(100deg, transparent 30%, color-mix(in srgb, ${color} 45%, transparent) 50%, transparent 70%)`,
    position: 'absolute',
  }),
  banner: {
    gap: space.md,
    paddingBlock: space.lg,
    animationDuration: '450ms',
    animationName: slideIn,
    animationTimingFunction: 'ease-out',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    width: '100%',
  },
  bannerBg: (color: string) => ({
    borderBlockStyle: 'solid',
    inset: 0,
    backgroundColor: `color-mix(in srgb, ${color} 22%, ${colors.bg})`,
    borderBlockColor: color,
    borderBlockWidth: 2,
    boxShadow: `0 0 18px color-mix(in srgb, ${color} 55%, transparent)`,
    position: 'absolute',
    transform: 'skewY(-8deg)',
  }),
  curse: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  name: {
    animationDelay: '250ms',
    animationDuration: '450ms',
    animationFillMode: 'both',
    animationName: slam,
    animationTimingFunction: 'ease-out',
    display: 'block',
    fontSize: 30,
    letterSpacing: '0.1em',
  },
  /** Who sent it, sliding in just before the name lands. */
  sender: {
    animationDelay: '80ms',
    animationDuration: '300ms',
    animationFillMode: 'both',
    animationName: riseIn,
    animationTimingFunction: 'ease-out',
    color: colors.text,
    fontSize: fontSize.md,
    maxWidth: '92%',
  },
  tagline: {
    animationDelay: '600ms',
    animationDuration: '350ms',
    animationFillMode: 'both',
    animationName: riseIn,
    animationTimingFunction: 'ease-out',
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: 700,
    letterSpacing: '0.08em',
  },
  glow: (color: string) => ({
    textShadow: `0 0 10px ${color}, 0 0 22px ${color}`,
  }),
  rules: {
    paddingInline: space.md,
    fontSize: fontSize.sm,
    lineHeight: 1.5,
  },
  /** The stage lengths live in CONFIG, which StyleX can't read at build time. */
  lasts: (ms: number) => ({ animationDuration: `${ms}ms` }),
  fades: (ms: number) => ({ transitionDuration: `${ms}ms` }),
  /** While GO! shows the dim lifts, so the board is back as the piece spawns. */
  rootClear: {
    backdropFilter: 'none',
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, backdrop-filter',
  },
  clear: {
    animationFillMode: 'both',
    animationName: clear,
    animationTimingFunction: 'ease-in',
  },
  callSlot: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    position: 'relative',
    height: 64,
  },
  call: {
    alignItems: 'center',
    display: 'flex',
    fontWeight: 900,
    justifyContent: 'center',
    position: 'relative',
  },
  ready: {
    paddingBlock: space.xs,
    paddingInline: space.md,
    animationFillMode: 'both',
    animationName: gather,
    animationTimingFunction: 'ease-out',
    fontSize: 18,
  },
  readyRing: (color: string) => ({
    inset: 0,
    borderColor: color,
    borderRadius: 999,
    borderStyle: 'solid',
    borderWidth: 2,
    animationFillMode: 'both',
    animationName: closeIn,
    animationTimingFunction: 'ease-out',
    position: 'absolute',
  }),
  go: {
    animationFillMode: 'both',
    animationName: punch,
    animationTimingFunction: 'ease-out',
    color: colors.success,
    fontSize: 48,
    fontStyle: 'italic',
  },
  burst: {
    borderColor: colors.success,
    borderRadius: '50%',
    borderStyle: 'solid',
    borderWidth: 4,
    animationFillMode: 'both',
    animationName: burst,
    animationTimingFunction: 'ease-out',
    position: 'absolute',
    height: 56,
    width: 56,
  },
});
