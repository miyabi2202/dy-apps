import { Pace } from '@dy-apps/douyin-chrome';
import type { BrowseItem, Comment } from '../core/types';
import { readRelated, readSearch } from '../douyin/answers';
import type { SearchFilter } from '../douyin/page-map';
import { PostComments, type PostGridSurface } from './post-comments';
import type { ResponseTap } from './ports';
import { orBlocked, readAll, requireItems, uniqueById } from './read-answers';

/** The Playwright side of douyin.com's search: one wait and one act per target. */
export interface SearchSurface extends PostGridSurface {
  /** Opens douyin.com's home page, where the search box is. */
  openHome(): Promise<void>;
  waitForSearchBox(): Promise<void>;
  clickSearchBox(): Promise<void>;
  /** Types the topic as typed input and presses Enter. */
  typeAndSearch(topic: string): Promise<void>;
  waitForFilter(filter: SearchFilter): Promise<void>;
  clickFilter(filter: SearchFilter): Promise<void>;
  /** Waits for the result tiles; throws when they don't show in time. */
  waitForResults(): Promise<void>;
  /** The related searches the page shows (相关搜索), when they're only in its HTML. */
  relatedSearches(): Promise<string[]>;
}

/** What a search found: two lists, the page's related searches, and the top comments of each post read. */
export interface SearchResult {
  topic: string;
  hot: BrowseItem[];
  newest: BrowseItem[];
  related: string[];
  comments: Record<string, Comment[]>;
}

/** What the topic learner needs of search. */
export interface SearchPort {
  search(topic: string): Promise<SearchResult>;
}

/** How long the page is given to fetch results after a search or a filter, in ms. */
const RESULTS_SETTLE_MS = 2000;

/**
 * A topic searched as a person does, each a Pace step: the search box seen, a pause, a click; a
 * pause, the topic typed and Enter; then the page's own 最热 and 最新 filters, each seen, a pause, a
 * click, and the posts read from the JSON the page fetched; each post opened for its comments.
 */
export class TopicSearch implements SearchPort {
  private opened = false;
  private readonly comments: PostComments;

  constructor(
    private readonly surface: SearchSurface,
    private readonly tap: ResponseTap,
    private readonly pace: Pace = new Pace(),
    /** How many posts of each list are kept, and opened for comments. */
    private readonly max = 10,
  ) {
    this.comments = new PostComments(surface, tap, pace);
  }

  async search(topic: string): Promise<SearchResult> {
    const { surface, pace, tap } = this;
    if (!this.opened) {
      await orBlocked(surface, () => pace.afterSeen(() => surface.openHome()));
      this.opened = true;
    }
    tap.drain('search');
    await orBlocked(surface, () =>
      pace.step(
        () => surface.waitForSearchBox(),
        () => surface.clickSearchBox(),
      ),
    );
    await pace.afterSeen(() => surface.typeAndSearch(topic));
    await orBlocked(surface, () => surface.waitForResults());
    await pace.wait(RESULTS_SETTLE_MS);

    const comments: Record<string, Comment[]> = {};
    const related = new Set<string>(readAll(tap.drain('search'), readRelatedAsResult).items);
    const lists: Record<SearchFilter, BrowseItem[]> = { 最热: [], 最新: [] };
    for (const filter of ['最热', '最新'] as const) {
      tap.drain('search');
      await orBlocked(surface, () =>
        pace.step(
          () => surface.waitForFilter(filter),
          () => surface.clickFilter(filter),
        ),
      );
      await pace.wait(RESULTS_SETTLE_MS);
      const bodies = tap.drain('search');
      for (const body of bodies) for (const word of readRelated(body)) related.add(word);
      const items = uniqueById(readAll(bodies, readSearch).items).slice(0, this.max);
      if (filter === '最热') requireItems('搜索结果', bodies, items);
      lists[filter] = items;
      await orBlocked(surface, () => surface.waitForResults());
      for (const [index, post] of items.entries())
        comments[post.id] = await this.comments.read(index);
    }
    for (const word of await surface.relatedSearches().catch(() => [])) related.add(word);
    const hot = lists.最热;
    const seen = new Set(hot.map((p) => p.id));
    const newest = lists.最新.filter((p) => !seen.has(p.id));
    related.delete(topic);
    return { topic, hot, newest, related: [...related], comments };
  }
}

/** The related searches in a body, shaped as a ReadResult so `readAll` can join them. */
function readRelatedAsResult(body: string) {
  return { items: readRelated(body), hasMore: false };
}
