import { colors, radius } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useRef, type PointerEvent } from 'react';
import { labels, testIds } from '../messages';

/** Where the bin sits, as fractions of the stage's width and height (its centre). */
export interface BinPlace {
  fx: number;
  fy: number;
}

/** The bin's size on screen, in CSS px. */
export const BIN_SIZE = 56;

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
 * Drag it to move it; it lights up while an icon is held over it.
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
    const stage = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!stage) return;
    const cx = event.clientX - dragRef.current.dx - stage.left;
    const cy = event.clientY - dragRef.current.dy - stage.top;
    const half = BIN_SIZE / 2;
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      {...stylex.props(styles.bin, hot && styles.hot, styles.at(place.fx * 100, place.fy * 100))}
    >
      <BinIcon open={hot} />
    </div>
  );
}

/** A bin with a lid that lifts when something is about to go in. */
function BinIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g {...stylex.props(styles.lid, open && styles.lidOpen)}>
        <path d="M4 7h16" />
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </g>
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

const styles = stylex.create({
  bin: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: 'solid',
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: colors.panel,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.55)',
    color: colors.text,
    cursor: 'grab',
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    touchAction: 'none',
    transform: 'translate(-50%, -50%)',
    transitionDuration: '120ms',
    transitionProperty: 'transform, background-color, border-color, color, box-shadow',
    userSelect: 'none',
    zIndex: 1,
    height: BIN_SIZE,
    width: BIN_SIZE,
  },
  hot: {
    borderColor: colors.danger,
    backgroundColor: `color-mix(in srgb, ${colors.danger} 30%, ${colors.panel})`,
    boxShadow: `0 0 0 4px ${colors.dangerSoft}, 0 0 24px ${colors.danger}`,
    color: colors.danger,
    transform: 'translate(-50%, -50%) scale(1.15)',
  },
  at: (leftPct: number, topPct: number) => ({
    left: `${leftPct}%`,
    top: `${topPct}%`,
  }),
  lid: {
    transformOrigin: '18px 7px',
    transitionDuration: '120ms',
    transitionProperty: 'transform',
  },
  lidOpen: {
    transform: 'rotate(-25deg) translateY(-2px)',
  },
});
