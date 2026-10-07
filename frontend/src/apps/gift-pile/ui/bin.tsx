import { colors } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useRef, type PointerEvent } from 'react';
import { labels, testIds } from '../messages';

/** Where the bin sits, as fractions of the stage's width and height (its centre). */
export interface BinPlace {
  fx: number;
  fy: number;
}

/** The bin image's size on screen, in CSS px; a dropped icon falling within it is caught. */
export const BIN_ICON_SIZE = 50;
const ICON_SIZE = BIN_ICON_SIZE;
/** The part of it that drags the bin, in CSS px: a little smaller, so its edge still picks up icons. */
const DRAG_SIZE = 44;
/** Where a held icon counts as over the bin, in CSS px: a little larger, so drops are forgiving. */
export const BIN_DROP_SIZE = 56;

/** The Windows-style Recycle Bin by Icons8 (see the README for the credit). */
const BIN_IMAGE = '/bin/recycle-bin.png';

interface Props {
  place: BinPlace;
  /** The stage's size on screen, in CSS px, to turn pointer moves into fractions. */
  stageWidth: number;
  stageHeight: number;
  onMove: (place: BinPlace) => void;
  /** An icon is being dragged over it. */
  hot: boolean;
}

/**
 * The rubbish bin: floats over the canvas, outside the physics and on top of everything.
 * Drag it by its middle to move it; it lights up while an icon is held over it. Only the
 * drag handle takes pointer events, so presses just outside the image reach the canvas.
 */
export function Bin({ place, stageWidth, stageHeight, onMove, hot }: Props) {
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      dx: event.clientX - (box.left + box.width / 2),
      dy: event.clientY - (box.top + box.height / 2),
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    // The handle sits in the bin, which sits in the stage.
    const stage = event.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
    if (!stage) return;
    const cx = event.clientX - dragRef.current.dx - stage.left;
    const cy = event.clientY - dragRef.current.dy - stage.top;
    const half = ICON_SIZE / 2;
    onMove({
      fx: Math.min(Math.max(cx, half), stageWidth - half) / stageWidth,
      fy: Math.min(Math.max(cy, half), stageHeight - half) / stageHeight,
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      role="img"
      aria-label={labels.bin}
      data-testid={testIds.bin}
      data-hot={hot || undefined}
      {...stylex.props(styles.bin, hot && styles.hot, styles.at(place.fx * 100, place.fy * 100))}
    >
      <img src={BIN_IMAGE} alt="" draggable={false} {...stylex.props(styles.image)} />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        {...stylex.props(styles.handle)}
      />
    </div>
  );
}

const styles = stylex.create({
  bin: {
    alignItems: 'center',
    display: 'flex',
    filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))',
    justifyContent: 'center',
    pointerEvents: 'none',
    position: 'absolute',
    transform: 'translate(-50%, -50%)',
    transitionDuration: '120ms',
    transitionProperty: 'transform, filter',
    userSelect: 'none',
    zIndex: 1,
    height: BIN_DROP_SIZE,
    width: BIN_DROP_SIZE,
  },
  hot: {
    filter: `drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 14px ${colors.danger})`,
    transform: 'translate(-50%, -50%) scale(1.1)',
  },
  at: (leftPct: number, topPct: number) => ({
    left: `${leftPct}%`,
    top: `${topPct}%`,
  }),
  image: {
    display: 'block',
    pointerEvents: 'none',
    height: ICON_SIZE,
    width: ICON_SIZE,
  },
  handle: {
    cursor: 'grab',
    pointerEvents: 'auto',
    position: 'absolute',
    touchAction: 'none',
    height: DRAG_SIZE,
    width: DRAG_SIZE,
  },
});
