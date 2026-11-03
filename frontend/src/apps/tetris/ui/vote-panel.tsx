import { hueFor } from '@dy-apps/services';
import { Avatar, Button } from '@dy-apps/ui';
import { colors, fontSize, radius, space } from '@dy-apps/ui/tokens.stylex';
import * as stylex from '@stylexjs/stylex';
import { CONFIG } from '../core/config';
import type { CurseDef, EffectType } from '../core/curses';
import type { VoteView } from '../core/game';
import { labels, testIds } from '../messages';
import { CurseName } from './curse-name';
import { RARITY_COLORS } from './rarity';
import { SenderBadge } from './sender-badge';

/** The popup dropping in over the board. */
const dropIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'translateY(-24px) scale(0.9)' },
  '60%': { opacity: 1, transform: 'translateY(4px) scale(1.02)' },
  '100%': { transform: 'translateY(0) scale(1)' },
});

/** A voter's avatar popping in under their pick. */
const popIn = stylex.keyframes({
  '0%': { opacity: 0, transform: 'scale(0.3)' },
  '70%': { opacity: 1, transform: 'scale(1.2)' },
  '100%': { transform: 'scale(1)' },
});

/** The streamer's +1 s glowing, so it is easy to find while the clock runs. */
const glow = stylex.keyframes({
  '0%': { boxShadow: `0 0 0 0 color-mix(in srgb, ${colors.accent} 70%, transparent)` },
  '70%': { boxShadow: `0 0 0 8px color-mix(in srgb, ${colors.accent} 0%, transparent)` },
  '100%': { boxShadow: `0 0 0 0 color-mix(in srgb, ${colors.accent} 0%, transparent)` },
});

/** The winning option pulsing once time is up. */
const win = stylex.keyframes({
  '0%': { transform: 'scale(1)' },
  '40%': { transform: 'scale(1.08)' },
  '100%': { transform: 'scale(1)' },
});

/**
 * An open vote over the board, play stopped: who drew it, the two curses with the viewers who
 * picked each under it, and the time left, with the streamer's +1 s. Once time is up the winner
 * lights up.
 */
export function VotePanel({
  vote,
  curseOf,
  onExtend,
}: {
  vote: VoteView;
  curseOf: (type: EffectType) => CurseDef<unknown>;
  onExtend: () => void;
}) {
  const color = RARITY_COLORS[vote.rarity];
  const done = vote.winner !== null;
  const seconds = Math.ceil(vote.remainingMs / 1000);
  return (
    <div {...stylex.props(styles.root)} data-testid={testIds.vote}>
      <div key={vote.id} {...stylex.props(styles.card(color))}>
        <SenderBadge sender={vote.sender} suffix="抽到了" xstyle={styles.sender} />
        <strong {...stylex.props(styles.title)}>{done ? '投票结束' : '投票决定诅咒'}</strong>
        {!done && <span {...stylex.props(styles.hint)}>弹幕发 1 或 2</span>}
        <ol {...stylex.props(styles.options)}>
          {vote.options.map((type, i) => {
            const def = curseOf(type);
            const voters = vote.ballots.filter((b) => b.choice === i);
            return (
              <li
                key={type}
                {...stylex.props(
                  styles.option,
                  done && (vote.winner === i ? styles.winner(color) : styles.loser),
                )}
                data-testid={testIds.voteOption(i)}
              >
                <div {...stylex.props(styles.optionHead)}>
                  <span {...stylex.props(styles.number(color))}>{i + 1}</span>
                  <strong {...stylex.props(styles.name)}>
                    <CurseName def={def} />
                  </strong>
                  <span {...stylex.props(styles.count)}>{voters.length} 票</span>
                </div>
                {voters.length > 0 && (
                  <div {...stylex.props(styles.voters)}>
                    {voters.map(({ voter }) => {
                      const hue = hueFor(voter.id);
                      return (
                        <span key={voter.id} title={voter.name} {...stylex.props(styles.voter)}>
                          <Avatar
                            user={{
                              id: voter.id,
                              nickname: voter.name,
                              avatarUrl: voter.avatarUrl,
                            }}
                            hue={hue}
                            ring={`hsl(${hue} 90% 66%)`}
                          />
                        </span>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!done && (
          <>
            <div {...stylex.props(styles.timer)}>
              <span {...stylex.props(styles.seconds)}>{seconds}s</span>
              <div {...stylex.props(styles.track)}>
                <div
                  {...stylex.props(
                    styles.fill(color, Math.min(1, vote.remainingMs / CONFIG.votes.durationMs)),
                  )}
                />
              </div>
            </div>
            <Button variant="primary" onClick={onExtend} xstyle={styles.extend}>
              {labels.extendVote}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  root: {
    inset: 0,
    padding: space.xs,
    alignItems: 'center',
    backdropFilter: 'blur(2px)',
    backgroundColor: `color-mix(in srgb, ${colors.bg} 70%, transparent)`,
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
  },
  card: (color: string) => ({
    padding: space.sm,
    borderColor: color,
    borderRadius: radius.md,
    borderStyle: 'solid',
    borderWidth: 2,
    gap: space.xs,
    alignItems: 'center',
    animationDuration: '350ms',
    animationName: dropIn,
    animationTimingFunction: 'ease-out',
    backgroundColor: `color-mix(in srgb, ${color} 14%, ${colors.bg})`,
    boxShadow: `0 0 18px color-mix(in srgb, ${color} 50%, transparent)`,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  }),
  sender: {
    fontSize: fontSize.sm,
  },
  title: {
    fontSize: fontSize.md,
    letterSpacing: '0.06em',
  },
  hint: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  options: {
    margin: 0,
    padding: 0,
    gap: space.xs,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  option: {
    padding: space.xs,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: 'solid',
    borderWidth: 1,
    gap: space.xxs,
    backgroundColor: colors.panel,
    display: 'flex',
    flexDirection: 'column',
    transitionDuration: '200ms',
    transitionProperty: 'opacity',
  },
  winner: (color: string) => ({
    borderColor: color,
    animationDuration: '600ms',
    animationName: win,
    boxShadow: `0 0 14px ${color}`,
  }),
  loser: {
    opacity: 0.35,
  },
  optionHead: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
  },
  number: (color: string) => ({
    borderRadius: radius.sm,
    placeItems: 'center',
    backgroundColor: color,
    color: colors.bg,
    display: 'grid',
    flexShrink: 0,
    fontSize: fontSize.md,
    fontWeight: 900,
    height: 24,
    width: 24,
  }),
  name: {
    overflow: 'hidden',
    flexGrow: 1,
    fontSize: fontSize.md,
    whiteSpace: 'nowrap',
  },
  count: {
    color: colors.muted,
    flexShrink: 0,
    fontSize: fontSize.xs,
  },
  voters: {
    gap: 2,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: 11,
  },
  voter: {
    animationDuration: '300ms',
    animationName: popIn,
    animationTimingFunction: 'ease-out',
    display: 'inline-flex',
  },
  timer: {
    gap: space.xs,
    alignItems: 'center',
    display: 'flex',
    width: '100%',
  },
  seconds: {
    fontSize: fontSize.md,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 900,
    minWidth: '2.2em',
  },
  track: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.panelRaised,
    flexGrow: 1,
    height: 8,
  },
  fill: (color: string, k: number) => ({
    backgroundColor: color,
    height: '100%',
    width: `${k * 100}%`,
  }),
  extend: {
    paddingBlock: 0,
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
    animationName: glow,
    fontSize: fontSize.md,
    fontWeight: 900,
    height: 32,
    minHeight: 32,
    width: '100%',
  },
});
