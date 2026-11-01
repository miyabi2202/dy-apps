import { readFileSync } from 'node:fs';
import { POSTS_MAX_CHARS, POSTS_SHOWN, recentPosts } from '../../core/memory/posts';
import type { Posts } from '../../app/ports';

/**
 * The streamer's own posts the bot reads about, in `path` (the room's memory/posts.md, which
 * `pnpm browse --streamer` writes): read on every use, so a run's new lines show at once. Missing
 * file, no posts.
 */
export function postsFile(path: string, count = POSTS_SHOWN, maxChars = POSTS_MAX_CHARS): Posts {
  return {
    recent() {
      try {
        return recentPosts(readFileSync(path, 'utf8'), count, maxChars);
      } catch {
        return '';
      }
    },
  };
}
