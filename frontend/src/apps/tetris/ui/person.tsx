import { colors } from '@dy-apps/ui/tokens.stylex';
import { hueFor } from '@dy-apps/services';
import { Avatar } from '@dy-apps/ui';
import * as stylex from '@stylexjs/stylex';
import { useId, type Ref } from 'react';
import type { Sender } from '../core/types';

/** A person is drawn 2 em wide; this many board cells to the em, so a stream can read its face. */
const SCALE = 1.3;
/** A person's size in board cells: its width, and how far below its top its hands are. */
export const PERSON_WIDTH = 2 * SCALE;
export const PERSON_HAND = 2.2 * SCALE;

/**
 * What a person wears: a burglar's stripes and beanie (小偷), or a volunteer's yellow vest (热心).
 */
export type Outfit = 'thief' | 'helper';

/**
 * Where its arms are, facing right: reaching for something low, up over its head, pushing straight
 * ahead, or one up with a thumbs up.
 */
export type Arms = 'reach' | 'up' | 'push' | 'thumb';

const ARMS: Record<Arms, string> = {
  reach: 'M14 4 L20 8 M6 4 L12 10',
  up: 'M5 3 L6 -14 M15 3 L14 -14',
  push: 'M14 4 L21 6 M6 5 L21 8',
  thumb: 'M15 4 L19 -2 M5 4 L3 11',
};

const SKIN = '#f5f5f5';

/**
 * A little person wearing the sender's avatar for a head, facing right, in board cells (one em is
 * one cell). Its parent places and flips it; `headRef` lets the parent keep the face from reading
 * backwards when it does.
 */
export function Person({
  sender,
  outfit,
  arms,
  walk,
  speedLines = false,
  headRef,
}: {
  sender: Sender | null;
  outfit: Outfit;
  arms: Arms;
  /** Legs striding, slowly or running; still if unset. */
  walk?: 'slow' | 'fast';
  /** Streaks trailing behind it, as it runs. */
  speedLines?: boolean;
  headRef?: Ref<HTMLDivElement>;
}) {
  const stripesId = useId();
  const shirt = outfit === 'thief' ? `url(#${stripesId})` : '#facc15';
  return (
    <div {...stylex.props(styles.figure(SCALE))}>
      {speedLines && <div aria-hidden {...stylex.props(styles.speedLines)} />}
      <div ref={headRef} {...stylex.props(styles.head)}>
        {sender ? (
          <Avatar
            user={{ id: sender.id, nickname: sender.name, avatarUrl: sender.avatarUrl }}
            hue={hueFor(sender.id)}
            ring={outfit === 'thief' ? '#111827' : '#f59e0b'}
          />
        ) : (
          <span {...stylex.props(styles.noFace)}>{outfit === 'thief' ? '🦹' : '🙂'}</span>
        )}
        {outfit === 'thief' && <span aria-hidden {...stylex.props(styles.beanie)} />}
      </div>
      <svg aria-hidden viewBox="0 0 20 22" {...stylex.props(styles.body)}>
        <defs>
          <pattern id={stripesId} width="20" height="4" patternUnits="userSpaceOnUse">
            <rect width="20" height="2" fill="#f5f5f5" />
            <rect y="2" width="20" height="2" fill="#111827" />
          </pattern>
        </defs>
        <g {...stylex.props(styles.leg, walk && styles.walk(walk === 'fast'))}>
          <rect x="6" y="13" width="3.5" height="9" rx="1.5" fill="#1f2937" />
        </g>
        <g {...stylex.props(styles.leg, walk && [styles.walk(walk === 'fast'), styles.otherLeg])}>
          <rect x="10.5" y="13" width="3.5" height="9" rx="1.5" fill="#1f2937" />
        </g>
        <rect x="4" y="1" width="12" height="14" rx="3" fill={shirt} />
        {outfit === 'helper' && (
          // The vest's reflective bands.
          <path d="M4 7 H16 M4 10 H16" stroke="#f8fafc" strokeWidth="1.2" />
        )}
        <path d={ARMS[arms]} stroke={SKIN} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {arms === 'thumb' && (
        <span aria-hidden {...stylex.props(styles.thumb)}>
          👍
        </span>
      )}
    </div>
  );
}

/** A leg swinging from the hip, the other half a stride behind. */
const stride = stylex.keyframes({
  '0%': { transform: 'rotate(-22deg)' },
  '50%': { transform: 'rotate(22deg)' },
  '100%': { transform: 'rotate(-22deg)' },
});

const styles = stylex.create({
  figure: (scale: number) => ({
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    fontSize: `${scale}em`,
    position: 'relative',
    width: '2em',
  }),
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
  /** At the raised hand. */
  thumb: {
    fontSize: '0.8em',
    lineHeight: 1,
    position: 'absolute',
    left: '1.9em',
    top: '0.6em',
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
