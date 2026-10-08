import type { DanmakuMessage, Logger } from '@dy-apps/services';

/** Messages logged one by one per window; the rest are only counted, so a busy room can't flood. */
const PER_WINDOW = 8;
const WINDOW_MS = 1000;
const TEXT_MAX = 24;

/** A message as one short line: kind, user and a clipped text. */
export function describeMessage(m: DanmakuMessage): string {
  if (m.gift) return `gift ${m.user.nickname}: ${m.gift.name} x${m.gift.count}`;
  if (m.likes) return `like ${m.user.nickname}: x${m.likes}`;
  const clipped = m.text.length > TEXT_MAX ? `${m.text.slice(0, TEXT_MAX)}…` : m.text;
  return `chat ${m.user.nickname}: ${clipped}`;
}

/**
 * Logs the messages reaching the wall at debug level: the first few each second one per line,
 * then a "+N more" summary when the next window starts. Cheap when debug is off.
 */
export function createMessageLogger(log: Logger, now: () => number = Date.now) {
  let windowStart = -Infinity;
  let shown = 0;
  let skipped = 0;
  return (m: DanmakuMessage): void => {
    if (!log.enabled('debug')) return;
    const t = now();
    if (t - windowStart >= WINDOW_MS) {
      if (skipped > 0) log.debug(`message: +${skipped} more not shown in the last second`);
      windowStart = t;
      shown = 0;
      skipped = 0;
    }
    if (shown < PER_WINDOW) {
      shown++;
      log.debug(`message: ${describeMessage(m)}`);
    } else skipped++;
  };
}
