import { readComments, readReplies } from '../douyin/answers';
import { Pace } from '@dy-apps/douyin-chrome';
import { markAsking, repliesToOpen } from '../core/comments';
import { BlockedError } from '../core/errors';
import type { Comment } from '../core/types';
import type { ResponseTap } from './ports';
import { orBlocked, readAll, type BlockSurface } from './read-answers';

/** How many of a post's comments are kept: the top of the list. */
export const MAX_COMMENTS = 20;
/** How long the page is given to fetch the comments after the post opens, in ms. */
const COMMENTS_SETTLE_MS = 1500;
/** Under how many comments of a post the replies (楼中楼) are opened. */
export const MAX_REPLY_THREADS = 3;
/** How many replies are kept under one comment. */
export const MAX_REPLIES = 5;
/** How long the page is given to fetch a comment's replies after 展开回复, in ms. */
const REPLIES_SETTLE_MS = 1200;

/** A grid of posts (a user's, a search's) where one can be opened to read its comments. */
export interface PostGridSurface extends BlockSurface {
  /** Waits for the tile at `index` (the post `id`'s, where the grid names tiles by post); throws when it doesn't show in time. */
  waitForPost(index: number, id?: string): Promise<void>;
  clickPost(index: number, id?: string): Promise<void>;
  /** Waits for the guide over the first video opened; throws when it doesn't show (soon). */
  waitForGuide(): Promise<void>;
  /** Clicks the guide's 我知道了. */
  dismissGuide(): Promise<void>;
  /**
   * Waits for what an opened post shows first: its comments, or (a search result's) its comment
   * button with the comments closed; throws when neither shows in time.
   */
  waitForCommentsOrButton(): Promise<'comments' | 'button'>;
  clickCommentButton(): Promise<void>;
  /** Waits for the comments to show; throws when they don't (a post with none, or comments off). */
  waitForComments(): Promise<void>;
  waitForClose(): Promise<void>;
  clickClose(): Promise<void>;
  /** Closes the post with Escape, for when its × isn't seen. */
  pressEscape(): Promise<void>;
  /** Waits for the 展开回复 button under the comment at `index`; throws when it doesn't show. */
  waitForReplies(index: number): Promise<void>;
  clickReplies(index: number): Promise<void>;
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
 * fetch its comments, reads what came back, opens the replies under a few of them (the ones that
 * ask what something is, then the most liked), and closes it the same way.
 */
export class PostComments {
  /** Whether the guide over the first video is out of the way (it shows once a session). */
  private guideDone = false;

  constructor(
    private readonly surface: PostGridSurface,
    private readonly tap: ResponseTap,
    private readonly pace: Pace,
  ) {}

  async read(index: number, id?: string): Promise<Comment[]> {
    const { surface, pace, tap } = this;
    tap.drain('comments');
    await orBlocked(surface, () =>
      pace.step(
        () => surface.waitForPost(index, id),
        () => surface.clickPost(index, id),
      ),
    );
    await this.passGuide();
    const shown = await this.openComments();
    if (shown) await pace.wait(COMMENTS_SETTLE_MS);
    const comments = markAsking(
      readAll(tap.drain('comments'), readComments).items.slice(0, MAX_COMMENTS),
    );
    if (shown) {
      for (const index of repliesToOpen(comments, MAX_REPLY_THREADS)) {
        const replies = await this.replies(index, comments[index]!);
        if (replies.length) comments[index] = { ...comments[index]!, replies };
      }
    }
    await closePost(surface, pace);
    return comments;
  }

  /** The guide over the first video, when it shows: seen, a pause, 我知道了. Looked for until it's gone once. */
  private async passGuide(): Promise<void> {
    if (this.guideDone) return;
    const { surface, pace } = this;
    const seen = await surface.waitForGuide().then(
      () => true,
      () => false,
    );
    if (!seen) return;
    await orBlocked(surface, () => pace.afterSeen(() => surface.dismissGuide()));
    this.guideDone = true;
  }

  /**
   * Whether the opened post's comments show: at once (a user's post), or after its comment button
   * is seen, a pause, a click (a search result). Neither in time is no comments, never a failed run.
   */
  private async openComments(): Promise<boolean> {
    const { surface, pace } = this;
    const first = await surface.waitForCommentsOrButton().catch(() => null);
    if (first !== 'button') return first === 'comments';
    await orBlocked(surface, () => pace.afterSeen(() => surface.clickCommentButton()));
    return surface.waitForComments().then(
      () => true,
      () => false,
    );
  }

  /**
   * The replies under the comment at `index`: its 展开回复 seen, a pause, a click, and the replies
   * read from what the page fetched. A button that doesn't show, or a click that fails, is no
   * replies, never a failed run; only a captcha or login wall stops it.
   */
  private async replies(index: number, comment: Comment): Promise<Comment[]> {
    const { surface, pace, tap } = this;
    const seen = await surface.waitForReplies(index).then(
      () => true,
      () => false,
    );
    if (!seen) return [];
    tap.drain('replies');
    try {
      await orBlocked(surface, () => pace.afterSeen(() => surface.clickReplies(index)));
    } catch (e) {
      if (e instanceof BlockedError) throw e;
      return [];
    }
    await pace.wait(REPLIES_SETTLE_MS);
    return markAsking(
      readAll(tap.drain('replies'), readReplies)
        .items.filter(({ parentId }) => !parentId || !comment.id || parentId === comment.id)
        .map(({ reply }) => reply)
        .slice(0, MAX_REPLIES),
    );
  }
}
