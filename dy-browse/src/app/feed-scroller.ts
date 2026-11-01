import type { DwellAction, DwellRule } from '../core/dwell';
import { EmptyReadError } from '../core/errors';
import { Pace } from '@dy-apps/douyin-chrome';
import type { BrowseItem, Comment } from '../core/types';
import { readComments, readFeed } from '../douyin/answers';
import { MAX_COMMENTS } from './post-comments';
import type { ResponseTap } from './ports';
import { orBlocked, readAll, uniqueById, type BlockSurface } from './read-answers';

/** The Playwright side of the 推荐 feed: one wait and one act per target, no pauses, no decisions. */
export interface FeedSurface extends BlockSurface {
  /** Opens the feed (douyin.com's home). */
  open(): Promise<void>;
  /** Waits for the playing video; throws when it doesn't show in time. */
  waitForPlayer(): Promise<void>;
  /** Moves to the next video (the key the page map names). */
  goToNext(): Promise<void>;
  waitForCommentButton(): Promise<void>;
  clickCommentButton(): Promise<void>;
  waitForComments(): Promise<void>;
  waitForClose(): Promise<void>;
  clickClose(): Promise<void>;
}

/** What the scroller did with one item. */
export interface FeedEntry {
  item: BrowseItem;
  action: DwellAction;
  dwellMs: number;
  comments: Comment[];
}

export interface FeedRunLimits {
  minutes: number;
  /** How many videos are watched to the end (skipped ones don't count). */
  maxVideos: number;
}

export type FeedStop = 'maxVideos' | 'minutes' | 'stalled';

export interface FeedScrollerOptions {
  pace?: Pace;
  dwell: DwellRule;
  now?: () => number;
}

/** How long the page is given to fetch the next batch, or the comments, in ms. */
const FETCH_SETTLE_MS = 1500;

/**
 * Scrolls the 推荐 feed as a person does, each move a Pace step. The feed's JSON says what each
 * video is before it plays, and the page plays them in that order, so the nth item announced is the
 * nth video shown. For each, the dwell rule says to skip it, watch it, or watch it and open the
 * comments; the scroller stays that long, then moves on. It reads; it never likes or follows.
 */
export class FeedScroller {
  private readonly pace: Pace;
  private readonly now: () => number;

  constructor(
    private readonly surface: FeedSurface,
    private readonly tap: ResponseTap,
    private readonly options: FeedScrollerOptions,
  ) {
    this.pace = options.pace ?? new Pace();
    this.now = options.now ?? Date.now;
  }

  async run(
    { minutes, maxVideos }: FeedRunLimits,
    onEntry: (entry: FeedEntry) => void | Promise<void> = () => {},
  ): Promise<{ entries: FeedEntry[]; stoppedBy: FeedStop }> {
    const { surface, pace, tap } = this;
    const deadline = this.now() + minutes * 60_000;
    const queue: BrowseItem[] = [];
    const bodies: string[] = [];
    const entries: FeedEntry[] = [];
    let watched = 0;

    tap.drain('feed');
    await orBlocked(surface, () => pace.afterSeen(() => surface.open()));
    await orBlocked(surface, () => surface.waitForPlayer());
    await pace.wait(FETCH_SETTLE_MS);

    const announce = () => {
      const fresh = tap.drain('feed');
      bodies.push(...fresh);
      const seen = new Set(queue.map((i) => i.id));
      for (const item of uniqueById(readAll(fresh, readFeed).items)) {
        if (!seen.has(item.id)) queue.push(item);
      }
    };

    for (let at = 0; ; at++) {
      if (at >= queue.length) announce();
      if (at >= queue.length) {
        // The feed announced nothing: either it never read at all, or it stalled.
        if (!queue.length) throw new EmptyReadError('推荐视频', bodies);
        return { entries, stoppedBy: 'stalled' };
      }
      const item = queue[at]!;
      const { action, dwellMs } = this.options.dwell.decide(item);
      if (dwellMs > 0) await pace.wait(dwellMs);
      let comments: Comment[] = [];
      if (action === 'watchWithComments') comments = await this.readComments();
      const entry: FeedEntry = { item, action, dwellMs, comments };
      entries.push(entry);
      await onEntry(entry);
      if (action !== 'skip') watched++;
      if (watched >= maxVideos) return { entries, stoppedBy: 'maxVideos' };
      if (this.now() >= deadline) return { entries, stoppedBy: 'minutes' };
      await orBlocked(surface, () =>
        pace.step(
          () => surface.waitForPlayer(),
          () => surface.goToNext(),
        ),
      );
      await pace.wait(FETCH_SETTLE_MS);
    }
  }

  /** Opens the comments as a step, reads what the page fetched, closes them as a step. */
  private async readComments(): Promise<Comment[]> {
    const { surface, pace, tap } = this;
    tap.drain('comments');
    await orBlocked(surface, () =>
      pace.step(
        () => surface.waitForCommentButton(),
        () => surface.clickCommentButton(),
      ),
    );
    const shown = await surface.waitForComments().then(
      () => true,
      () => false,
    );
    if (shown) await pace.wait(FETCH_SETTLE_MS);
    const comments = readAll(tap.drain('comments'), readComments).items.slice(0, MAX_COMMENTS);
    if (shown) {
      await pace.step(
        () => surface.waitForClose(),
        () => surface.clickClose(),
      );
    }
    return comments;
  }
}
