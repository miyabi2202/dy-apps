/** How many of the streamer's latest posts the memory shows, and the most characters they take. */
export const POSTS_SHOWN = 8;
export const POSTS_MAX_CHARS = 1200;

/**
 * The latest lines of `memory/posts.md` (what `pnpm browse --streamer` wrote of the streamer's own
 * posts: `- 2026-10-31：…… [id:123]` a line), for `{{memory}}`: the `count` newest by their date
 * (a line with no date reads as the oldest), then as many of those, newest first, as fit
 * `maxChars`, without the `- ` and the `[id:…]`, oldest first, `2026-10-31：…` a line. Empty when
 * there are none.
 */
export function recentPosts(text: string, count = POSTS_SHOWN, maxChars = POSTS_MAX_CHARS): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) =>
      /^- (.+)$/
        .exec(line.trim())?.[1]
        ?.replace(/\s*\[id:[^\]]*\]\s*$/, '')
        .trim(),
    )
    .filter((line): line is string => !!line)
    .map((line, order) => ({ line, order, date: /^(\d{4}-\d{2}-\d{2})/.exec(line)?.[1] ?? '' }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order))
    .slice(0, count);
  const kept: string[] = [];
  let size = 0;
  for (const { line } of lines) {
    const length = [...line].length + 1;
    if (kept.length && size + length > maxChars) break;
    kept.push([...line].slice(0, maxChars).join(''));
    size += length;
  }
  return kept.reverse().join('\n');
}
