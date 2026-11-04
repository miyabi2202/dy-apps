import { TopicSearch, type SearchSurface } from '../src/app/topic-search';
import { BlockedError, EmptyReadError } from '../src/core/errors';
import { Pace } from '@dy-apps/douyin-chrome';
import { commentsBody, FakeTap } from './support/fakes';
import { logWait } from './support/memory-store';

const result = (ids: string[]) => ({
  data: ids.map((id) => ({
    aweme_info: { aweme_id: id, desc: `视频${id}`, author: { nickname: 'x' } },
  })),
});

function setup({
  hot = ['h1', 'h2'],
  newest = ['n1', 'h2'],
  wall = null as 'captcha' | 'login' | null,
  max = 10,
  guide = false,
  opens = 'comments',
  shown = [] as string[],
  single = false,
  popup = false,
}: {
  hot?: string[];
  newest?: string[];
  wall?: 'captcha' | 'login' | null;
  max?: number;
  /** Whether the guide over the first video shows. */
  guide?: boolean;
  /** What an opened post shows first. */
  opens?: 'comments' | 'button';
  /** The posts the grid shows a tile for; none named keeps them all. */
  shown?: string[];
  /** Whether the results show in one column, with no grid, until 多列 is clicked. */
  single?: boolean;
  /** Whether the 「下载电脑客户端」 popup shows, until its × is clicked. */
  popup?: boolean;
} = {}) {
  const log: string[] = [];
  const tap = new FakeTap();
  const surface: SearchSurface = {
    openHome: () => Promise.resolve(void log.push('open home')),
    blocked: () => Promise.resolve(wall),
    waitForSearchBox: () => Promise.resolve(void log.push('wait for search box')),
    clickSearchBox: () => Promise.resolve(void log.push('click search box')),
    typeAndSearch: (topic) => {
      log.push(`type ${topic} and search`);
      tap.push('search', result(['default1']));
      return Promise.resolve();
    },
    waitForFilterMenu: () => Promise.resolve(void log.push('wait for 筛选')),
    openFilterMenu: () => Promise.resolve(void log.push('hover 筛选')),
    waitForFilter: (f) => Promise.resolve(void log.push(`wait for filter ${f}`)),
    clickFilter: (f) => {
      log.push(`click filter ${f}`);
      tap.push('search', result(f === '最热' ? hot : newest));
      return Promise.resolve();
    },
    waitForResults: () => {
      if (single) {
        log.push('wait for results: none');
        return Promise.reject(new Error('timeout'));
      }
      log.push('wait for results');
      return Promise.resolve();
    },
    waitForGridToggle: () => Promise.resolve(void log.push('wait for 多列')),
    clickGridToggle: () => {
      single = false;
      log.push('click 多列');
      return Promise.resolve();
    },
    shownPosts: () => Promise.resolve(shown),
    relatedSearches: () => Promise.resolve(['页面上的相关搜索']),
    waitForPost: (i, id) => Promise.resolve(void log.push(`wait for post ${i} (${id})`)),
    clickPost: (i, id) => {
      log.push(`click post ${i} (${id})`);
      tap.push('comments', commentsBody([`评论${i}`]));
      return Promise.resolve();
    },
    waitForGuide: () => {
      if (!guide) return Promise.reject(new Error('timeout'));
      log.push('wait for guide');
      return Promise.resolve();
    },
    dismissGuide: () => {
      guide = false;
      log.push('click 我知道了');
      return Promise.resolve();
    },
    waitForCommentsOrButton: () => {
      log.push(opens === 'comments' ? 'wait for comments' : 'wait for comments: comment button');
      return Promise.resolve(opens);
    },
    clickCommentButton: () => Promise.resolve(void log.push('click comment button')),
    waitForComments: () => Promise.resolve(void log.push('wait for comments')),
    waitForClose: () => Promise.resolve(void log.push('wait for close')),
    clickClose: () => Promise.resolve(void log.push('click close')),
    pressEscape: () => Promise.resolve(void log.push('press Escape')),
    waitForReplies: (i) => Promise.resolve(void log.push(`wait for replies ${i}`)),
    clickReplies: (i) => Promise.resolve(void log.push(`click replies ${i}`)),
    guideShown: () => Promise.resolve(popup),
    clickGuideClose: () => {
      popup = false;
      log.push('click popup ×');
      return Promise.resolve();
    },
  };
  const pace = new Pace({ wait: logWait(log), random: () => 0 });
  return { search: new TopicSearch(surface, tap, pace, max), log, tap };
}

describe('TopicSearch', () => {
  it('searches as steps (box seen, pause, click; pause, type), then each sort from the 筛选 menu as steps, then each post by its id', async () => {
    const { search, log } = setup({ hot: ['h1'], newest: ['n1'], max: 1 });
    await search.search('鸣潮');
    expect(log).toEqual([
      'wait 500',
      'open home',
      'wait for search box',
      'wait 500',
      'click search box',
      'wait 500',
      'type 鸣潮 and search',
      'wait for results',
      'wait 2000',
      'wait for 筛选',
      'wait 500',
      'hover 筛选',
      'wait for filter 最热',
      'wait 500',
      'click filter 最热',
      'wait 2000',
      'wait for results',
      'wait 2000',
      'wait for post 0 (h1)',
      'wait 500',
      'click post 0 (h1)',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
      'wait for 筛选',
      'wait 500',
      'hover 筛选',
      'wait for filter 最新',
      'wait 500',
      'click filter 最新',
      'wait 2000',
      'wait for results',
      'wait 2000',
      'wait for post 0 (n1)',
      'wait 500',
      'click post 0 (n1)',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
    ]);
  });

  it('closes the 「下载电脑客户端」 popup as a step before hovering 筛选 under it, and only while it shows', async () => {
    const { search, log } = setup({ hot: ['h1'], newest: ['n1'], max: 1, popup: true });
    await search.search('鸣潮');
    const at = log.indexOf('click popup ×');
    expect(log.slice(at - 1, at + 3)).toEqual([
      'wait 500',
      'click popup ×',
      'wait for 筛选',
      'wait 500',
    ]);
    expect(log.indexOf('hover 筛选')).toBeGreaterThan(at);
    expect(log.filter((l) => l === 'click popup ×')).toHaveLength(1);
  });

  it('clicks 我知道了 on the guide as a step the first time it shows, and opens the comments by their button as a step', async () => {
    const { search, log } = setup({
      hot: ['h1', 'h2'],
      newest: [],
      max: 2,
      guide: true,
      opens: 'button',
    });
    await search.search('鸣潮');
    const post0 = log.indexOf('click post 0 (h1)');
    expect(log.slice(post0 + 1, post0 + 9)).toEqual([
      'wait for guide',
      'wait 500',
      'click 我知道了',
      'wait for comments: comment button',
      'wait 500',
      'click comment button',
      'wait for comments',
      'wait 1500',
    ]);
    expect(log.filter((l) => l === 'click 我知道了')).toHaveLength(1);
    expect(log.filter((l) => l === 'click comment button')).toHaveLength(2);
  });

  it('clicks 多列 as a step when the results show with no grid, and waits for the grid again', async () => {
    const { search, log } = setup({ hot: ['h1'], newest: [], max: 1, single: true });
    await search.search('辣条公主');
    const at = log.indexOf('wait for results: none');
    expect(log.slice(at, at + 5)).toEqual([
      'wait for results: none',
      'wait for 多列',
      'wait 500',
      'click 多列',
      'wait for results',
    ]);
  });

  it('reads only the posts the grid shows a tile for, when it names its tiles', async () => {
    const { search, log } = setup({ hot: ['pinned', 'h1'], newest: ['n1'], shown: ['h1', 'n1'] });
    const found = await search.search('鸣潮');
    expect(found.hot.map((p) => p.id)).toEqual(['h1']);
    expect(log.some((l) => l.includes('(pinned)'))).toBe(false);
  });

  it('opens a post once in a run: not again in the other list, nor under another term', async () => {
    const { search, log } = setup({ hot: ['h1', 'both'], newest: ['both', 'n1'] });
    const first = await search.search('鸣潮');
    const second = await search.search('今汐');
    const opened = log.filter((l) => l.startsWith('click post'));
    expect(opened).toEqual(['click post 0 (h1)', 'click post 1 (both)', 'click post 1 (n1)']);
    // The second search found the same posts: it gives their comments without opening them.
    expect(second.comments['both']).toEqual(first.comments['both']);
    expect(second.comments['n1']!.length).toBeGreaterThan(0);
  });

  it('gives a term searched before in the run what it found then, without searching again', async () => {
    const { search, log } = setup({ hot: ['h1'], newest: ['n1'] });
    const first = await search.search('爱播');
    log.length = 0;
    expect(await search.search('爱播')).toBe(first);
    expect(log).toEqual([]);
  });

  it('opens the home page only for the first search of a run', async () => {
    const { search, log } = setup({ hot: ['h1'], newest: ['n1'], max: 1 });
    await search.search('a');
    await search.search('b');
    expect(log.filter((l) => l === 'open home')).toHaveLength(1);
  });

  it('gives the hottest and the newest without duplicates, with comments and related searches', async () => {
    const { search } = setup();
    const found = await search.search('鸣潮');
    expect(found.hot.map((p) => p.id)).toEqual(['h1', 'h2']);
    // h2 is in both lists: it's kept once, in the hottest.
    expect(found.newest.map((p) => p.id)).toEqual(['n1']);
    expect(found.comments['h1']!.map((c) => c.text)).toEqual(['评论0']);
    expect(found.related).toEqual(['页面上的相关搜索']);
  });

  it('keeps at most `max` of each list', async () => {
    const { search } = setup({ hot: ['a', 'b', 'c'], newest: ['d', 'e', 'f'], max: 2 });
    const found = await search.search('t');
    expect(found.hot).toHaveLength(2);
    expect(found.newest).toHaveLength(2);
  });

  it('stops the run with the raw bodies when the hottest list has no posts', async () => {
    const { search } = setup({ hot: [] });
    const error = await search.search('t').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmptyReadError);
    expect((error as EmptyReadError).bodies).toEqual(['{"data":[]}']);
  });

  it('stops at a captcha', async () => {
    const { search } = setup({ wall: 'captcha' });
    await expect(search.search('t')).rejects.toBeInstanceOf(BlockedError);
  });
});
