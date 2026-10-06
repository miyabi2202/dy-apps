import { colors } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { useRef, type PointerEvent } from 'react';
import { labels, testIds } from '../messages';

/** Where the bin sits, as fractions of the stage's width and height (its centre). */
export interface BinPlace {
  fx: number;
  fy: number;
}

/** The drop area's size on screen, in CSS px: a little larger than the bin itself. */
export const BIN_SIZE = 72;
/** The bin's own size, in CSS px. */
const ICON_SIZE = 52;

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
 * The rubbish bin, a wire basket like the Mac's: floats over the canvas, outside the physics
 * and on top of everything. Drag it to move it; it fills up while an icon is held over it.
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
      <BinIcon full={hot} />
    </div>
  );
}

/** A wire-mesh basket; `full` shows crumpled paper in it, as something is about to go in. */
function BinIcon({ full }: { full: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={ICON_SIZE} height={ICON_SIZE}>
      <defs>
        <linearGradient id="gift-pile-bin-body" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#9aa3b2" />
          <stop offset="0.35" stopColor="#dfe4ec" />
          <stop offset="0.7" stopColor="#aab3c2" />
          <stop offset="1" stopColor="#6f7889" />
        </linearGradient>
        <linearGradient id="gift-pile-bin-rim" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c7cdd8" />
          <stop offset="0.5" stopColor="#f3f5f8" />
          <stop offset="1" stopColor="#9aa3b2" />
        </linearGradient>
      </defs>
      {/* Body: a tapered cylinder. */}
      <path
        d="M13 20 L18.5 55.5 Q32 61 45.5 55.5 L51 20 Z"
        fill="url(#gift-pile-bin-body)"
        stroke="#5b6475"
        strokeWidth={1}
      />
      {/* Mesh: the vertical wires and three hoops. */}
      <g stroke="rgba(30, 36, 48, 0.55)" strokeWidth={1} fill="none">
        <path d="M19 23 L23 56 M25 24 L27.5 58 M32 24.5 L32 58.5 M39 24 L36.5 58 M45 23 L41 56" />
        <path d="M14.8 32 Q32 37.5 49.2 32 M16.6 43 Q32 48 47.4 43 M18 52 Q32 57 46 52" />
      </g>
      {/* The paper inside, once something is about to go in. */}
      <g {...stylex.props(styles.paper, full && styles.paperShown)}>
        <path
          d="M23 21 L27 13 L33 16 L37 11 L42 17 L46 15 L44 22 Z"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth={1}
          strokeLinejoin="round"
        />
        <path d="M28 16 L34 19 M36 14 L39 19" stroke="#cbd5e1" strokeWidth={1} />
      </g>
      {/* Rim. */}
      <ellipse
        cx="32"
        cy="20"
        rx="19.5"
        ry="5.5"
        fill="rgba(17, 24, 39, 0.35)"
        stroke="url(#gift-pile-bin-rim)"
        strokeWidth={2.5}
      />
    </svg>
  );
}

const styles = stylex.create({
  bin: {
    alignItems: 'center',
    cursor: 'grab',
    display: 'flex',
    filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))',
    justifyContent: 'center',
    position: 'absolute',
    touchAction: 'none',
    transform: 'translate(-50%, -50%)',
    transitionDuration: '120ms',
    transitionProperty: 'transform, filter',
    userSelect: 'none',
    zIndex: 1,
    height: BIN_SIZE,
    width: BIN_SIZE,
  },
  hot: {
    filter: `drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5)) drop-shadow(0 0 14px ${colors.danger})`,
    transform: 'translate(-50%, -50%) scale(1.12)',
  },
  at: (leftPct: number, topPct: number) => ({
    left: `${leftPct}%`,
    top: `${topPct}%`,
  }),
  paper: {
    opacity: 0,
    transform: 'translateY(6px)',
    transformOrigin: '34px 18px',
    transitionDuration: '120ms',
    transitionProperty: 'opacity, transform',
  },
  paperShown: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});
