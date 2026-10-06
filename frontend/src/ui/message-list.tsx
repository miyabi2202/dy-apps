import type { DanmakuMessage } from '@dy-apps/services';
import * as stylex from '@stylexjs/stylex';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from './button';
import type { CardStyle } from './card-style';
import { MessageCard } from './message-card';
import { testIds } from './messages';
import { colors, fontSize, radius, space } from './tokens.stylex';

/** How close to the bottom (px) still counts as following new messages. */
const STICK_THRESHOLD = 40;

interface Props {
  messages: readonly DanmakuMessage[];
  settings: CardStyle;
  /** Hide the scrollbar (for OBS). */
  bare?: boolean;
}

/**
 * Virtualised, bottom-anchored message feed. Follows new messages while scrolled to the
 * bottom; scrolling up pauses that and shows a "new messages" button.
 */
export function MessageList({ messages, settings, bare = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ids whose fly-in finished. Rows remount as they scroll in and out; this stops replays.
  const [landed] = useState(() => new Set<string>());
  const [following, setFollowing] = useState(true);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- the virtualizer's API isn't memo-safe; nothing here memoises it
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => settings.fontSize * 4 + 20,
    getItemKey: (i) => messages[i]?.id ?? i,
    overscan: 6,
  });
  const totalSize = virtualizer.getTotalSize();

  // Stay pinned to the bottom as messages arrive, rows get measured, or the box resizes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (following && el) el.scrollTop = el.scrollHeight;
  }, [following, totalSize, messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    if (atBottom === following) return;
    setFollowing(atBottom);
    if (!atBottom) setLastSeenId(messages.at(-1)?.id ?? null);
  };

  const seenIndex = lastSeenId === null ? -1 : messages.findIndex((m) => m.id === lastSeenId);
  const unread = following ? 0 : messages.length - 1 - seenIndex;

  return (
    <div {...stylex.props(styles.root)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-testid={testIds.danmakuList}
        {...stylex.props(styles.scroller, bare && styles.bare)}
      >
        {/* Pushed to the bottom while the content is shorter than the box. */}
        <div {...stylex.props(styles.inner, styles.height(totalSize))}>
          {virtualizer.getVirtualItems().map((item) => {
            const message = messages[item.index];
            if (!message) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                {...stylex.props(styles.row, styles.offset(item.start))}
              >
                <MessageCard
                  message={message}
                  settings={settings}
                  animate={!landed.has(message.id)}
                  onLanded={() => landed.add(message.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {unread > 0 && (
        <Button variant="primary" onClick={() => setFollowing(true)} xstyle={styles.jump}>
          {unread} 条新消息 ↓
        </Button>
      )}
    </div>
  );
}

const styles = stylex.create({
  root: {
    position: 'relative',
    height: '100%',
    width: '100%',
  },
  scroller: {
    display: 'flex',
    flexDirection: 'column',
    scrollbarColor: `color-mix(in srgb, ${colors.muted} 50%, transparent) transparent`,
    scrollbarWidth: 'thin',
    height: '100%',
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  bare: {
    scrollbarWidth: 'none',
  },
  inner: {
    flexShrink: 0,
    position: 'relative',
    marginTop: 'auto',
    width: '100%',
  },
  height: (px: number) => ({ height: px }),
  // Padding leaves room for glows and the fly-in's sideways start.
  row: {
    paddingBlock: space.sm,
    paddingInline: space.lg,
    insetInlineStart: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  offset: (px: number) => ({ transform: `translateY(${px}px)` }),
  // Positioning only; the look is the shared primary Button.
  jump: {
    borderRadius: radius.pill,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
    fontSize: fontSize.sm,
    insetInlineStart: '50%',
    position: 'absolute',
    transform: 'translateX(-50%)',
    bottom: space.lg,
  },
});
