import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import { Avatar } from '@dy-apps/ui';
import { hueFor } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useId, useRef } from 'react';
import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import type { GameEngine } from '../core/game';
import type { TheftView } from '../core/theft-clock';
import { testIds } from '../messages';
import { PIECE_COLORS } from '../render/paint';
import { SenderBadge } from './sender-badge';

/** The thief is drawn 2 em wide; this many board cells to the em, so a stream can read its face. */
const SCALE = 1.3;
/** Its size in board cells: its width, and how far below its top its reaching hand is. */
const WIDTH = 2 * SCALE;
const HAND = 2.2 * SCALE;

/** Where the thief and the cell it carries are, in board cells from the top left. */
export interface TheftPose {
  x: number;
  y: number;
  /** 1 faces right, -1 left. */
  facing: 1 | -1;
  /** The stolen cell once it is off the board; null while still in place. */
  carry: { x: number; y: number } | null;
}

/**
 * The thief at `view`'s moment, passing through: in from the side farther from its cell, creeping
 * across in stop-and-go steps, hopping as it lifts the cell over its head, then speeding on out
 * the nearer side.
 */
export function theftPose(view: TheftView, cols: number = CONFIG.board.cols): TheftPose {
  if (view.x >= cols / 2) return poseFromLeft(view, cols);
  // A cell in the left half: the same walk, mirrored.
  const pose = poseFromLeft({ ...view, x: cols - 1 - view.x }, cols);
  return {
    x: cols - pose.x - WIDTH,
    y: pose.y,
    facing: pose.facing === 1 ? -1 : 1,
    carry: pose.carry && { x: cols - 1 - pose.carry.x, y: pose.carry.y },
  };
}

/** In from the left, out the right. */
function poseFromLeft(view: TheftView, cols: number): TheftPose {
  const { stage, progress: t } = view;
  const atX = view.x - WIDTH;
  const atY = view.y + 0.5 - HAND;
  const offX = -WIDTH - 1;
  const overHead = (x: number, y: number) => ({ x: x + (WIDTH - 1) / 2, y: y - 1 });
  if (stage === 'sneak') {
    // Each tiptoe is a burst then a pause; the bursts still add up to the full distance.
    const steps = 4;
    const crept = t - Math.sin(2 * Math.PI * steps * t) / (2 * Math.PI * steps);
    const bob = -0.15 * Math.abs(Math.sin(Math.PI * steps * t));
    return { x: offX + (atX - offX) * crept, y: atY + bob, facing: 1, carry: null };
  }
  if (stage === 'grab') {
    const y = atY - 0.3 * Math.sin(Math.PI * t);
    const lift = 1 - (1 - t) ** 2;
    const held = overHead(atX, y);
    return {
      x: atX,
      y,
      facing: 1,
      carry: { x: view.x + (held.x - view.x) * lift, y: view.y + (held.y - view.y) * lift },
    };
  }
  const x = atX + (cols + 1 - atX) * t * t;
  const y = atY - 0.3 * Math.abs(Math.sin(Math.PI * 6 * t));
  return { x, y, facing: 1, carry: overHead(x, y) };
}

const TITLE = '有小偷！';

/**
 * 小偷 over the board: a striped thief wearing the sender's avatar for a head sneaks in from the
 * left, lifts one cell out and runs off with it. It moves every frame from the engine's clock,
 * so it stops when play does.
 */
export function TheftScene({ engine, theft }: { engine: GameEngine; theft: TheftView }) {
  const thiefRef = useRef<HTMLDivElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const stripesId = useId();

  useEffect(() => {
    let frame = 0;
    const place = () => {
      const view = engine.theft;
      if (view && thiefRef.current && cellRef.current && headRef.current) {
        const pose = theftPose(view);
        thiefRef.current.style.transform = `translate(${pose.x}em, ${pose.y}em) scaleX(${pose.facing})`;
        // The face turns with the body but never reads backwards.
        headRef.current.style.transform = `scaleX(${pose.facing})`;
        cellRef.current.style.visibility = pose.carry ? 'visible' : 'hidden';
        if (pose.carry) {
          cellRef.current.style.transform = `translate(${pose.carry.x}em, ${pose.carry.y}em)`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const { stage, sender } = theft;
  const armsUp = stage !== 'sneak';
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.theft} data-stage={stage}>
      <div {...stylex.props(styles.banner)}>
        <strong {...stylex.props(styles.title)}>{TITLE}</strong>
        <span {...stylex.props(styles.tagline)}>{CURSES.theft.tagline}</span>
        {sender && <SenderBadge sender={sender} suffix="下的手" xstyle={styles.sender} />}
      </div>
      <div {...stylex.props(styles.cells(CONFIG.board.cols))}>
        <div ref={cellRef} {...stylex.props(styles.cell(PIECE_COLORS[theft.cell]))} />
        <div ref={thiefRef} {...stylex.props(styles.thief)}>
          <div {...stylex.props(styles.figure(SCALE))}>
            {stage === 'flee' && <div aria-hidden {...stylex.props(styles.speedLines)} />}
            <div ref={headRef} {...stylex.props(styles.head)}>
              {sender ? (
                <Avatar
                  user={{ id: sender.id, nickname: sender.name, avatarUrl: sender.avatarUrl }}
                  hue={hueFor(sender.id)}
                  ring="#111827"
                />
              ) : (
                <span {...stylex.props(styles.noFace)}>🦹</span>
              )}
              <span aria-hidden {...stylex.props(styles.beanie)} />
            </div>
            <svg aria-hidden viewBox="0 0 20 22" {...stylex.props(styles.body)}>
              <defs>
                <pattern id={stripesId} width="20" height="4" patternUnits="userSpaceOnUse">
                  <rect width="20" height="2" fill="#f5f5f5" />
                  <rect y="2" width="20" height="2" fill="#111827" />
                </pattern>
              </defs>
              <g {...stylex.props(styles.leg, stage !== 'grab' && styles.walk(stage === 'flee'))}>
                <rect x="6" y="13" width="3.5" height="9" rx="1.5" fill="#1f2937" />
              </g>
              <g
                {...stylex.props(
                  styles.leg,
                  stage !== 'grab' && [styles.walk(stage === 'flee'), styles.otherLeg],
                )}
              >
                <rect x="10.5" y="13" width="3.5" height="9" rx="1.5" fill="#1f2937" />
              </g>
              <rect x="4" y="1" width="12" height="14" rx="3" fill={`url(#${stripesId})`} />
              {armsUp ? (
                <path
                  d="M5 3 L6 -14 M15 3 L14 -14"
                  stroke="#f5f5f5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M14 4 L20 8 M6 4 L12 10"
                  stroke="#f5f5f5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A leg swinging from the hip, the other half a stride behind. */
const stride = stylex.keyframes({
  '0%': { transform: 'rotate(-22deg)' },
  '50%': { transform: 'rotate(22deg)' },
  '100%': { transform: 'rotate(-22deg)' },
});

const shake = stylex.keyframes({
  '0%': { transform: 'translateX(0) rotate(0deg)' },
  '25%': { transform: 'translateX(-3px) rotate(-3deg)' },
  '75%': { transform: 'translateX(3px) rotate(3deg)' },
  '100%': { transform: 'translateX(0) rotate(0deg)' },
});

const textShadow = `0 0 4px ${colors.bg}, 0 0 10px ${colors.bg}`;

const styles = stylex.create({
  /** The board's size, for the cell-sized em below. */
  root: {
    inset: 0,
    overflow: 'hidden',
    containerType: 'size',
    pointerEvents: 'none',
    position: 'absolute',
  },
  banner: {
    gap: space.xxs,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
    paddingTop: space.lg,
  },
  title: {
    animationDuration: '300ms',
    animationIterationCount: 4,
    animationName: shake,
    color: colors.danger,
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textShadow: `${textShadow}, 0 3px 0 ${colors.bg}`,
  },
  tagline: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: 700,
    textShadow,
  },
  sender: {
    color: colors.text,
    fontSize: fontSize.sm,
    textShadow,
    maxWidth: '92%',
  },
  /** One em is one board cell, so poses in cells place straight onto the board. */
  cells: (cols: number) => ({
    inset: 0,
    fontSize: `calc(100cqw / ${cols})`,
    position: 'absolute',
  }),
  cell: (color: string) => ({
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 2,
    borderStyle: 'solid',
    borderWidth: 1,
    backgroundColor: color,
    boxShadow: `0 0 10px ${color}`,
    position: 'absolute',
    visibility: 'hidden',
    zIndex: 1,
    height: '1em',
    left: 0,
    top: 0,
    width: '1em',
  }),
  figure: (scale: number) => ({
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    fontSize: `${scale}em`,
    position: 'relative',
    width: '2em',
  }),
  thief: {
    position: 'absolute',
    transform: 'translateX(-10em)',
    left: 0,
    top: 0,
  },
  head: {
    fontSize: '0.75em',
    position: 'relative',
  },
  noFace: {
    display: 'block',
    fontSize: '1.6em',
    lineHeight: 1,
  },
  /** A burglar's beanie over the top of the head. */
  beanie: {
    borderRadius: '0.9em 0.9em 0.2em 0.2em',
    backgroundColor: '#111827',
    boxShadow: '0 0.12em 0 #374151',
    position: 'absolute',
    height: '0.7em',
    left: '-0.1em',
    right: '-0.1em',
    top: '-0.35em',
  },
  body: {
    overflow: 'visible',
    height: '2.2em',
    marginTop: '-0.1em',
    width: '2em',
  },
  leg: {
    transformOrigin: '10px 13px',
  },
  walk: (fast: boolean) => ({
    animationDuration: fast ? '160ms' : '650ms',
    animationIterationCount: 'infinite',
    animationName: stride,
    animationTimingFunction: 'ease-in-out',
  }),
  otherLeg: {
    animationDirection: 'reverse',
  },
  /** Running off: streaks trailing behind it (on its left, before any flip to face left). */
  speedLines: {
    backgroundImage: `repeating-linear-gradient(180deg, ${colors.text} 0 2px, transparent 2px 0.45em)`,
    maskImage: 'linear-gradient(90deg, transparent, black)',
    opacity: 0.7,
    position: 'absolute',
    height: '1.6em',
    left: '-1.6em',
    top: '1.6em',
    width: '1.4em',
  },
});
