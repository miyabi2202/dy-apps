import { readComments } from '../douyin/answers';
import { Pace } from '@dy-apps/douyin-chrome';
import type { Comment } from '../core/types';
import type { ResponseTap } from './ports';
import { orBlocked, readAll, type BlockSurface } from './read-answers';

/** How many of a post's comments are kept: the top of the list. */
export const MAX_COMMENTS = 20;
/** How long the page is given to fetch the comments after the post opens, in ms. */
const COMMENTS_SETTLE_MS = 1500;

/** A grid of posts (a user's, a search's) where one can be opened to read its comments. */
export interface PostGridSurface extends BlockSurface {
  /** Waits for the tile at `index`; throws when it doesn't show in time. */
  waitForPost(index: number): Promise<void>;
  clickPost(index: number): Promise<void>;
  /** Waits for the comments to show; throws when they don't (a post with none, or comments off). */
  waitForComments(): Promise<void>;
  waitForClose(): Promise<void>;
  clickClose(): Promise<void>;
  /** Closes the post with Escape, for when its × isn't seen. */
  pressEscape(): Promise<void>;
}

/**
 * Closes what's open as a person does: its × seen, a pause, a click; or, when the × doesn't show
 * (Douyin's isn't always where the page map says), a pause and Escape.
 */
export async function closePost(
  surface: Pick<PostGridSurface, 'waitForClose' | 'clickClose' | 'pressEscape'>,
  pace: Pace,
): Promise<void> {
  const seen = await surface.waitForClose().then(
    () => true,
    () => false,
  );
  await pace.afterSeen(() => (seen ? surface.clickClose() : surface.pressEscape()));
}

/**
 * Opens one post of a grid as a person does (the tile seen, a pause, a click), which makes the page
 * fetch its comments, reads what came back, and closes it the same way.
 */
export class PostComments {
  constructor(
    private readonly surface: PostGridSurface,
    private readonly tap: ResponseTap,
    private readonly pace: Pace,
  ) {}

  async read(index: number): Promise<Comment[]> {
    const { surface, pace, tap } = this;
    tap.drain('comments');
    await orBlocked(surface, () =>
      pace.step(
        () => surface.waitForPost(index),
        () => surface.clickPost(index),
      ),
    );
    const shown = await surface.waitForComments().then(
      () => true,
      () => false,
    );
    if (shown) await pace.wait(COMMENTS_SETTLE_MS);
    const comments = readAll(tap.drain('comments'), readComments).items.slice(0, MAX_COMMENTS);
    await closePost(surface, pace);
    return comments;
  }
}
