import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import { shovedAt, type ShoveView } from '../core/shove-clock';
import { testIds } from '../messages';
import { Person, PERSON_HAND, PERSON_WIDTH } from './person';

/** Where the helper is, in board cells from the top left, and how far it has popped up. */
export interface HelperPose {
  x: number;
  y: number;
  /** 1 faces right, -1 left: the way it pushes. */
  facing: 1 | -1;
  /** 0 to 1 as it pops up beside the piece. */
  scale: number;
}

/**
 * The helper at `view`'s moment: it pops up on the far side of the piece from where it goes,
 * hands at the piece's middle, and keeps them there as the piece comes up and across. Once the
 * piece drops, it stays put.
 */
export function helperPose(view: ShoveView): HelperPose {
  const facing = view.to.x > view.from.x ? 1 : -1;
  const at =
    view.stage === 'drop' || view.stage === 'thanks'
      ? { x: view.to.x, y: view.liftY }
      : shovedAt(view);
  const { box } = view;
  const x = facing === 1 ? at.x + box.left - PERSON_WIDTH : at.x + box.right + 1;
  const y = at.y + (box.top + box.bottom + 1) / 2 - PERSON_HAND;
  // Pops up with a little overshoot.
  const t = view.stage === 'enter' ? view.progress : 1;
  const scale = t < 0.7 ? (t / 0.7) * 1.15 : 1.15 - 0.15 * ((t - 0.7) / 0.3);
  return { x, y, facing, scale };
}

/**
 * 热心 over the board: a helper in a yellow vest wearing the sender's avatar pops up beside the
 * piece about to lock, pushes it a column over (out of its gap first, if it was snug), watches it
 * drop, and gives a thumbs up. It moves every frame from the engine's clock, so it stops when
 * play does.
 */
export function ShoveScene({ engine, shove }: { engine: GameEngine; shove: ShoveView }) {
  const helperRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const place = () => {
      const view = engine.shoving;
      if (view && helperRef.current && headRef.current && bubbleRef.current) {
        const pose = helperPose(view);
        helperRef.current.style.transform = `translate(${pose.x}em, ${pose.y}em) scaleX(${pose.facing}) scale(${pose.scale})`;
        // The face turns with the body but never reads backwards.
        headRef.current.style.transform = `scaleX(${pose.facing})`;
        bubbleRef.current.style.transform = `translate(${pose.x + PERSON_WIDTH / 2}em, ${pose.y}em)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const { stage, sender } = shove;
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.shove} data-stage={stage}>
      <div {...stylex.props(styles.cells(CONFIG.board.cols))}>
        <div ref={helperRef} {...stylex.props(styles.helper)}>
          <Person
            sender={sender}
            outfit="helper"
            arms={stage === 'enter' ? 'reach' : stage === 'thanks' ? 'thumb' : 'push'}
            walk={stage === 'push' ? 'slow' : undefined}
            headRef={headRef}
          />
        </div>
        <div ref={bubbleRef} {...stylex.props(styles.anchor)}>
          {stage === 'thanks' && <div {...stylex.props(styles.bubble)}>不用谢 👍</div>}
        </div>
      </div>
    </div>
  );
}

/** The speech bubble popping out of the helper. */
const popIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translate(-50%, -100%) scale(0.4)' },
  '60%': { opacity: 1, transform: 'translate(-50%, -100%) scale(1.1)' },
  '100%': { transform: 'translate(-50%, -100%) scale(1)' },
});

const styles = stylex.create({
  /** The board's size, for the cell-sized em below. The helper may stand past its edge. */
  root: {
    inset: 0,
    containerType: 'size',
    pointerEvents: 'none',
    position: 'absolute',
  },
  /** One em is one board cell, so poses in cells place straight onto the board. */
  cells: (cols: number) => ({
    inset: 0,
    fontSize: `calc(100cqw / ${cols})`,
    position: 'absolute',
  }),
  helper: {
    position: 'absolute',
    transform: 'translateX(-10em)',
    left: 0,
    top: 0,
  },
  anchor: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  bubble: {
    borderRadius: radius.md,
    paddingBlock: space.xxs,
    paddingInline: space.sm,
    animationDuration: '300ms',
    animationFillMode: 'both',
    animationName: popIn,
    animationTimingFunction: 'ease-out',
    backgroundColor: '#ffffff',
    boxShadow: `0 2px 8px color-mix(in srgb, ${colors.bg} 60%, transparent)`,
    color: '#111827',
    fontSize: fontSize.sm,
    fontWeight: 800,
    position: 'absolute',
    whiteSpace: 'nowrap',
  },
});
