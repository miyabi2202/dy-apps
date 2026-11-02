import { hueFor } from '@dy-apps/services';
import { Avatar } from '@dy-apps/ui';
import * as stylex from '@stylexjs/stylex';
import type { Sender } from '../core/types';

/** Who a curse came from: their avatar (or initial) and name, then `suffix`, like 送的. */
export function SenderBadge({
  sender,
  suffix,
  xstyle,
}: {
  sender: Sender;
  suffix?: string;
  xstyle?: stylex.StyleXStyles;
}) {
  const hue = hueFor(sender.id);
  return (
    <span {...stylex.props(styles.badge, xstyle)}>
      <Avatar
        user={{ id: sender.id, nickname: sender.name, avatarUrl: sender.avatarUrl }}
        hue={hue}
        ring={`hsl(${hue} 90% 66%)`}
      />
      <span {...stylex.props(styles.name)}>{sender.name}</span>
      {suffix && <span {...stylex.props(styles.suffix)}>{suffix}</span>}
    </span>
  );
}

const styles = stylex.create({
  badge: {
    gap: '0.4em',
    alignItems: 'center',
    display: 'inline-flex',
    maxWidth: '100%',
  },
  /** A long name shrinks and ends in …; the suffix always stays whole. */
  name: {
    overflow: 'hidden',
    fontWeight: 700,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  suffix: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
});
