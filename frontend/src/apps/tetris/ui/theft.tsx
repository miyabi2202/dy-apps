import { colors, fontSize, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import { CONFIG } from '../core/config';
import { CURSES } from '../core/curses';
import type { GameEngine } from '../core/game';
import type { TheftView } from '../core/theft-clock';
import { testIds } from '../messages';
import { PIECE_COLORS } from '../render/paint';
import { Person, PERSON_HAND as HAND, PERSON_WIDTH as WIDTH } from './person';
import { SenderBadge } from './sender-badge';

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
          <Person
            sender={sender}
            outfit="thief"
            arms={stage === 'sneak' ? 'reach' : 'up'}
            walk={stage === 'sneak' ? 'slow' : stage === 'flee' ? 'fast' : undefined}
            speedLines={stage === 'flee'}
            headRef={headRef}
          />
        </div>
      </div>
    </div>
  );
}

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
  thief: {
    position: 'absolute',
    transform: 'translateX(-10em)',
    left: 0,
    top: 0,
  },
});
