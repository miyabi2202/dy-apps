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
}: { hot?: string[]; newest?: string[]; wall?: 'captcha' | 'login' | null; max?: number } = {}) {
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
    waitForFilter: (f) => Promise.resolve(void log.push(`wait for filter ${f}`)),
    clickFilter: (f) => {
      log.push(`click filter ${f}`);
      tap.push('search', result(f === '最热' ? hot : newest));
      return Promise.resolve();
    },
    waitForResults: () => Promise.resolve(void log.push('wait for results')),
    relatedSearches: () => Promise.resolve(['页面上的相关搜索']),
    waitForPost: (i) => Promise.resolve(void log.push(`wait for post ${i}`)),
    clickPost: (i) => {
      log.push(`click post ${i}`);
      tap.push('comments', commentsBody([`评论${i}`]));
      return Promise.resolve();
    },
    waitForComments: () => Promise.resolve(void log.push('wait for comments')),
    waitForClose: () => Promise.resolve(void log.push('wait for close')),
    clickClose: () => Promise.resolve(void log.push('click close')),
    pressEscape: () => Promise.resolve(void log.push('press Escape')),
  };
  const pace = new Pace({ wait: logWait(log), random: () => 0 });
  return { search: new TopicSearch(surface, tap, pace, max), log, tap };
}

describe('TopicSearch', () => {
  it('searches as steps (box seen, pause, click; pause, type), then each filter as a step, then each post', async () => {
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
      'wait for filter 最热',
      'wait 500',
      'click filter 最热',
      'wait 2000',
      'wait for results',
      'wait for post 0',
      'wait 500',
      'click post 0',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
      'wait for filter 最新',
      'wait 500',
      'click filter 最新',
      'wait 2000',
      'wait for results',
      'wait for post 0',
      'wait 500',
      'click post 0',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
    ]);
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
