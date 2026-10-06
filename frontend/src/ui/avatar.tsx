import type { DanmakuUser } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';

/** The user's picture, or their first character on a hue gradient if there is none. */
export function Avatar({ user, hue, ring }: { user: DanmakuUser; hue: number; ring: string }) {
  const [broken, setBroken] = useState(false);
  if (user.avatarUrl && !broken) {
    return (
      <img
        alt=""
        src={user.avatarUrl}
        onError={() => setBroken(true)}
        {...stylex.props(styles.avatar, styles.ring(ring))}
      />
    );
  }
  return (
    <span aria-hidden {...stylex.props(styles.avatar, styles.ring(ring), styles.initial(hue))}>
      {Array.from(user.nickname)[0] ?? '?'}
    </span>
  );
}

const styles = stylex.create({
  avatar: {
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    height: '1.9em',
    width: '1.9em',
  },
  ring: (color: string) => ({
    boxShadow: `0 0 0 2px ${color}`,
  }),
  initial: (hue: number) => ({
    placeItems: 'center',
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 75% 58%), hsl(${(hue + 40) % 360} 80% 42%))`,
    color: '#fff',
    display: 'grid',
    fontSize: '0.95em',
    fontWeight: 700,
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
  }),
});
