// The same shape as room-feed's src/douyin/page-map.ts (VIEWPORT, PAGE_WAIT), for douyin.com
// instead of the live-room page.
//
// Everything below is a GUESS from what douyin.com's web pages are known to look like, until the
// first manual run against the real site (see README, "The first manual run"). When Douyin changes
// the page, or the guess is wrong, this is the one file to fix.

/** The size of the window the page is opened in, which decides the layout it gives. */
export const VIEWPORT = { width: 1440, height: 900 };

export const DOUYIN_HOME = 'https://www.douyin.com/';
export const userUrl = (secUid: string) => `https://www.douyin.com/user/${secUid}`;
export const roomUrl = (roomId: string) => `https://live.douyin.com/${roomId}`;

/** How long a step waits for what it acts on, in ms (a target that doesn't show in time throws). */
export const PAGE_WAIT = {
  load: 45_000,
  /** The grid of a user's posts, the search results or the feed's first video. */
  content: 20_000,
  searchBox: 10_000,
  filter: 10_000,
  /** The comments panel, or the button that opens it. */
  comments: 8000,
  /** The guide over the first video opened: short, since it shows once a session. */
  guide: 1500,
  /** A comment's 展开回复 button: short, since most comments have none. */
  replies: 3000,
  /** Settling after a page loads, before the first action. */
  settle: 2500,
};

/** The search box in the header, and the button beside it. */
export const SEARCH_INPUT = '[data-e2e="searchbar-input"]';

/**
 * The sorts on the search results page, in the menu that opens when 筛选 is hovered (seen on the
 * first topic run, 2026-11-01: 排序依据 综合排序 / 最新发布 / 最多点赞).
 */
export const SEARCH_FILTER_MENU = '筛选';
export const SEARCH_FILTERS = { 最热: '最多点赞', 最新: '最新发布' } as const;
export type SearchFilter = keyof typeof SEARCH_FILTERS;

/**
 * One result tile in the search page's grid (seen on the first topic run, 2026-11-01: each is
 * `waterfall_item_<aweme id>`), and one post tile in a user's page.
 */
export const SEARCH_RESULT = '[id^="waterfall_item_"]';
export const searchResultOf = (id: string) => `[id="waterfall_item_${id}"]`;
export const USER_POST = '[data-e2e="user-post-list"] li';

/** The "related searches" block on the search page (相关搜索), where it's only in the HTML. */
export const RELATED_SEARCHES = '[data-e2e="search-related"] a, [class*="relatedSearch"] a';

/** The feed's player, and its comment button and the panel's close ×. */
export const FEED_PLAYER = '[data-e2e="feed-active-video"]';
export const COMMENT_BUTTON = '[data-e2e="feed-comment-icon"]';
export const COMMENT_PANEL = '[data-e2e="comment-list"]';
export const COMMENTS_CLOSE = '[data-e2e="comment-close"], [data-e2e="video-comment-close"]';
/** One comment in the open post's comments, in the order the comment list's JSON gives them. */
export const COMMENT_ITEM = '[data-e2e="comment-item"]';
/** The 「展开 N 条回复」 button under a comment, which makes the page fetch its replies. */
export const REPLIES_BUTTON = /展开\s*\d*\s*条?回复/;
/**
 * The comment button of the video a post opened in: a search result opens the video with its
 * comments closed (seen on the first topic run, 2026-11-01).
 */
export const POST_COMMENT_BUTTON = '[data-e2e="feed-active-video"] [data-e2e="feed-comment-icon"]';
/**
 * The guide over the first video a session opens (「滚动"鼠标"或点按"键盘上下键"查看更多推荐视频」),
 * which covers the video until 我知道了 is clicked.
 */
export const GUIDE_MASK = '#douyin-web-recommend-guide-mask';
export const GUIDE_OK = '我知道了';
/** The key that moves the feed to the next video. */
export const NEXT_VIDEO_KEY = 'ArrowDown';

/** What a captcha or a login wall looks like: any of these showing ends the run. */
/**
 * What a list shows when Douyin's call for it failed (「服务异常，重新刷新拉取数据」, seen on a user's
 * 作品 on the first run, 2026-11-01), and the 刷新 link in it that asks again.
 */
export const SERVICE_ERROR = 'text=服务异常';
export const SERVICE_RETRY = 'text=刷新 >> visible=true';

export const BLOCK_SELECTORS = {
  captcha: '#captcha_container, .captcha_verify_container, [id*="captcha"]',
  login: '#login-pannel, [data-e2e="login-pannel"], #douyin_login_comp_flat_panel',
};

/**
 * Which of the JSON calls the page makes a URL is, by its path. The captured bodies are given to
 * the matching reader (see douyin/*-answer.ts). Paths are the web API's, from memory.
 */
export type AnswerKind = 'feed' | 'posts' | 'search' | 'comments' | 'replies';

export function answerKindOf(url: string): AnswerKind | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  // Before the comment list, whose path it starts with.
  if (path.includes('/aweme/v1/web/comment/list/reply')) return 'replies';
  if (path.includes('/aweme/v1/web/comment/list')) return 'comments';
  if (path.includes('/aweme/v1/web/aweme/post')) return 'posts';
  if (path.includes('/aweme/v1/web/general/search') || path.includes('/aweme/v1/web/search/item'))
    return 'search';
  if (path.includes('/aweme/v2/web/module/feed') || path.includes('/aweme/v1/web/tab/feed'))
    return 'feed';
  return null;
}
