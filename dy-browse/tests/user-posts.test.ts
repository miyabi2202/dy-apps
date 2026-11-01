import { UserPosts, type UserSurface } from '../src/app/user-posts';
import { BlockedError, EmptyReadError } from '../src/core/errors';
import { Pace } from '@dy-apps/douyin-chrome';
import { commentsBody, FakeTap, postsBody } from './support/fakes';
import { logWait } from './support/memory-store';

/** A user page that logs what it's asked, in order, and fetches the next scripted page on a scroll. */
function setup({
  pages,
  wall = null as 'captcha' | 'login' | null,
}: {
  pages: object[];
  wall?: 'captcha' | 'login' | null;
}) {
  const log: string[] = [];
  const tap = new FakeTap();
  let next = 0;
  const fetchNext = () => {
    const page = pages[next++];
    if (page) tap.push('posts', page);
  };
  const surface: UserSurface = {
    open: (secUid) => {
      log.push(`open ${secUid}`);
      fetchNext();
      return Promise.resolve();
    },
    blocked: () => Promise.resolve(wall),
    waitForPosts: () => Promise.resolve(void log.push('wait for posts')),
    scrollPosts: () => {
      log.push('scroll');
      fetchNext();
      return Promise.resolve();
    },
    waitForPost: (i) => Promise.resolve(void log.push(`wait for post ${i}`)),
    clickPost: (i) => {
      log.push(`click post ${i}`);
      tap.push('comments', commentsBody(['好看', '求原曲']));
      return Promise.resolve();
    },
    waitForComments: () => Promise.resolve(void log.push('wait for comments')),
    waitForClose: () => Promise.resolve(void log.push('wait for close')),
    clickClose: () => Promise.resolve(void log.push('click close')),
  };
  const pace = new Pace({ wait: logWait(log), random: () => 0 });
  return { posts: new UserPosts(surface, tap, pace), log, tap };
}

describe('UserPosts', () => {
  it('pauses, opens the page; waits for the grid, and stops when there is enough', async () => {
    const { posts, log } = setup({ pages: [postsBody(['3', '2', '1'], true)] });
    const list = await posts.list('SEC', (p) => p.length >= 3);
    expect(list.map((p) => p.id)).toEqual(['3', '2', '1']);
    expect(log).toEqual(['wait 500', 'open SEC', 'wait for posts']);
  });

  it('scrolls as a step (wait, pause, act), then lets the page fetch, until enough or nothing more', async () => {
    const { posts, log } = setup({
      pages: [postsBody(['6', '5'], true), postsBody(['4', '3'], true), postsBody(['2'], false)],
    });
    const list = await posts.list('SEC', () => false);
    expect(list.map((p) => p.id)).toEqual(['6', '5', '4', '3', '2']);
    expect(log).toEqual([
      'wait 500',
      'open SEC',
      'wait for posts',
      'wait for posts',
      'wait 500',
      'scroll',
      'wait 1500',
      'wait for posts',
      'wait 500',
      'scroll',
      'wait 1500',
    ]);
  });

  it('gives each post once when a scroll brings it again', async () => {
    const { posts } = setup({ pages: [postsBody(['2', '1'], true), postsBody(['1', '0'], false)] });
    expect((await posts.list('SEC', () => false)).map((p) => p.id)).toEqual(['2', '1', '0']);
  });

  it('stops the run, with the raw body, when the first answer has no posts', async () => {
    const { posts } = setup({ pages: [{ status_code: 0, unexpected: true }] });
    const error = await posts.list('SEC', () => true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmptyReadError);
    expect((error as EmptyReadError).bodies).toEqual(['{"status_code":0,"unexpected":true}']);
  });

  it.each(['captcha', 'login'] as const)('stops at the first %s wall', async (wall) => {
    const { posts, log } = setup({ pages: [postsBody(['1'], false)], wall });
    await expect(posts.list('SEC', () => true)).rejects.toBeInstanceOf(BlockedError);
    expect(log).toEqual(['wait 500', 'open SEC']);
  });

  it('opens a post as a step, reads its comments after the page fetched them, closes it as a step', async () => {
    const { posts, log } = setup({ pages: [postsBody(['2', '1'], false)] });
    await posts.list('SEC', () => true);
    log.length = 0;
    const comments = await posts.commentsAt(1);
    expect(log).toEqual([
      'wait for post 1',
      'wait 500',
      'click post 1',
      'wait for comments',
      'wait 1500',
      'wait for close',
      'wait 500',
      'click close',
    ]);
    expect(comments.map((c) => c.text)).toEqual(['好看', '求原曲']);
  });
});
