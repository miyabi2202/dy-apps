import { DEFAULT_CARD_STYLE, fontFamily, MessageList } from '@dy-apps/ui';
import * as stylex from '@stylexjs/stylex';
import { useSyncExternalStore } from 'react';
import type { GiftFeed } from '../gift-feed';

/** Each gift as a 弹幕墙 card: who sent it, how many, and the curses it drew. */
export function GiftWall({ feed }: { feed: GiftFeed }) {
  const messages = useSyncExternalStore(feed.subscribe, feed.getMessages);
  return (
    <div
      data-testid="gift-history"
      aria-label="送礼记录"
      {...stylex.props(
        styles.wall,
        styles.font(fontFamily(DEFAULT_CARD_STYLE), DEFAULT_CARD_STYLE.fontSize),
      )}
    >
      <MessageList messages={messages} settings={DEFAULT_CARD_STYLE} />
    </div>
  );
}

const styles = stylex.create({
  wall: {
    height: 360,
  },
  font: (family: string, size: number) => ({
    fontFamily: family,
    fontSize: size,
  }),
});
