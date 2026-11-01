import { Pace } from '@dy-apps/douyin-chrome';
import { ServiceErrorStopped } from '../core/errors';
import type { BrowseItem, Comment } from '../core/types';
import { readUserPosts } from '../douyin/answers';
import { PostComments, type PostGridSurface } from './post-comments';
import type { ResponseTap } from './ports';
import { orBlocked, readAll, requireItems, uniqueById } from './read-answers';

/** The Playwright side of a user's page (douyin.com/user/<sec_uid>): one wait and one act per target. */
export interface UserSurface extends PostGridSurface {
  /** Opens the user's page. */
  open(secUid: string): Promise<void>;
  /** Waits for the grid of posts; throws when it doesn't show in time. */
  waitForPosts(): Promise<void>;
  /** Waits for the grid of posts or Douyin's 「服务异常」 in its place, and says which; throws when neither shows in time. */
  waitForPostsOrError(): Promise<'posts' | 'error'>;
  /** Waits for the 刷新 link in 「服务异常」. */
  waitForRetry(): Promise<void>;
  clickRetry(): Promise<void>;
  scrollPosts(): Promise<void>;
}

/** What `StreamerPosts` needs of the user's page. */
export interface UserPostsPort {
  /** The posts in the order the page lists them, scrolled until `until` says enough. */
  list(secUid: string, until: (posts: readonly BrowseItem[]) => boolean): Promise<BrowseItem[]>;
  /** The top comments of the post at this position in the last `list`. */
  commentsAt(index: number): Promise<Comment[]>;
}

/** How long the page is given to fetch the next posts after a scroll, in ms. */
const SCROLL_SETTLE_MS = 1500;
/** Scrolls before giving up on `until`, so a long profile can't run on. */
const MAX_SCROLLS = 25;
/** How many times 刷新 is clicked when the grid shows 「服务异常」 instead of the posts. */
const MAX_RETRIES = 3;
/** How long a person looks at 「服务异常」 before clicking 刷新, in ms. */
const RETRY_AFTER_MS = 3000;

/**
 * A user's page, opened and scrolled as a person would, each a Pace step: a pause, the address
 * opened; the grid seen, a pause, a scroll; and the same before a post is opened for its comments.
 * The posts are read from the JSON the page fetches, not from the page.
 */
export class UserPosts implements UserPostsPort {
  private readonly comments: PostComments;

  constructor(
    private readonly surface: UserSurface,
    private readonly tap: ResponseTap,
    private readonly pace: Pace = new Pace(),
  ) {
    this.comments = new PostComments(surface, tap, pace);
  }

  async list(
    secUid: string,
    until: (posts: readonly BrowseItem[]) => boolean,
  ): Promise<BrowseItem[]> {
    const { surface, pace, tap } = this;
    tap.drain('posts');
    await orBlocked(surface, () => pace.afterSeen(() => surface.open(secUid)));
    await orBlocked(surface, () => this.waitForGrid());
    const bodies: string[] = [];
    for (let scrolls = 0; ; scrolls++) {
      bodies.push(...tap.drain('posts'));
      const read = readAll(bodies, readUserPosts);
      const posts = uniqueById(read.items);
      // The first answer is the page's own; with none at all the JSON isn't what we read.
      if (scrolls === 0) requireItems('作品', bodies, posts);
      if (until(posts) || !read.hasMore || scrolls >= MAX_SCROLLS) return posts;
      await orBlocked(surface, () =>
        pace.step(
          () => surface.waitForPosts(),
          () => surface.scrollPosts(),
        ),
      );
      await pace.wait(SCROLL_SETTLE_MS);
    }
  }

  /**
   * The grid seen. Douyin sometimes shows 「服务异常，重新刷新拉取数据」 instead (its call for the posts
   * failed); then, after a look, 刷新 is clicked as a step, up to MAX_RETRIES times.
   */
  private async waitForGrid(): Promise<void> {
    const { surface, pace } = this;
    for (let tries = 0; ; tries++) {
      if ((await surface.waitForPostsOrError()) === 'posts') return;
      if (tries >= MAX_RETRIES) throw new ServiceErrorStopped('作品列表', tries);
      await pace.wait(RETRY_AFTER_MS);
      await pace.step(
        () => surface.waitForRetry(),
        () => surface.clickRetry(),
      );
    }
  }

  commentsAt(index: number): Promise<Comment[]> {
    return this.comments.read(index);
  }
}
