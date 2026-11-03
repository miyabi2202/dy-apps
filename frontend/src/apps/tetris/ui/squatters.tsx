import { hueFor } from '@dy-apps/services';
import { Avatar } from '@dy-apps/ui';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { SquatterView } from '../core/types';
import { testIds } from '../messages';

/** What a 钉子户 wears on its cell. */
const BADGE = '📌';
/** A 钉子户 no viewer sent (a quiet room): a face for it anyway. */
const NO_FACE = '🏠';

/**
 * The 钉子户 over their board cells, each with the sender's avatar, slamming down as they land.
 */
export function Squatters({ squatters }: { squatters: readonly SquatterView[] }) {
  return (
    <div aria-hidden {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.cells(CONFIG.board.cols))}>
        {squatters.map(({ id, x, y, sender }) => (
          <div key={id} data-testid={testIds.nail} {...stylex.props(styles.spot, styles.at(x, y))}>
            <div {...stylex.props(styles.face, styles.slam)}>
              {sender ? (
                <Avatar
                  user={{ id: sender.id, nickname: sender.name, avatarUrl: sender.avatarUrl }}
                  hue={hueFor(sender.id)}
                  ring="#ef4444"
                />
              ) : (
                <span {...stylex.props(styles.noFace)}>{NO_FACE}</span>
              )}
              <span {...stylex.props(styles.badge)}>{BADGE}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dropped from above, landing hard. */
const slamDown = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(-6em)' },
  '60%': { opacity: 1, transform: 'translateY(0) scaleY(0.8)' },
  '80%': { transform: 'translateY(-0.15em) scaleY(1.05)' },
  '100%': { transform: 'translateY(0)' },
});

const styles = stylex.create({
  /** The board's size, for the cell-sized em below. */
  root: {
    inset: 0,
    containerType: 'size',
    pointerEvents: 'none',
    position: 'absolute',
  },
  /** One em is one board cell. */
  cells: (cols: number) => ({
    inset: 0,
    fontSize: `calc(100cqw / ${cols})`,
    position: 'absolute',
  }),
  spot: {
    position: 'absolute',
    height: '1em',
    left: 0,
    top: 0,
    width: '1em',
  },
  at: (x: number, y: number) => ({
    transform: `translate(${x}em, ${y}em)`,
  }),
  face: {
    placeItems: 'center',
    display: 'grid',
    fontSize: '0.62em',
    position: 'relative',
    height: '100%',
    width: '100%',
  },
  slam: {
    animationDuration: '600ms',
    animationName: slamDown,
    animationTimingFunction: 'ease-in',
  },
  noFace: {
    fontSize: '1.5em',
    lineHeight: 1,
  },
  badge: {
    fontSize: '1.1em',
    lineHeight: 1,
    position: 'absolute',
    right: '-0.35em',
    top: '-0.35em',
  },
});
