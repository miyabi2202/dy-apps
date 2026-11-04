import { UserPosts, type UserSurface } from '../src/app/user-posts';
import { BlockedError, EmptyReadError, ServiceErrorStopped } from '../src/core/errors';
import { Pace } from '@dy-apps/douyin-chrome';
import { commentsBody, FakeTap, postsBody, repliesBody } from './support/fakes';
import { logWait } from './support/memory-store';

/** A user page that logs what it's asked, in order, and fetches the next scripted page on a scroll. */
function setup({
  pages,
  wall = null as 'captcha' | 'login' | null,
  grid = [] as ('posts' | 'error')[],
  closeShown = true,
  comments = commentsBody(['好看', '求原曲']),
  repliesShown = [] as number[],
  repliesFetched = true,
  wallOnReplies = null as 'captcha' | null,
}: {
  pages: object[];
  /** The comment list a post fetches when opened. */
  comments?: object;
  /** The comments whose 展开回复 shows. */
  repliesShown?: number[];
  /** Whether 展开回复 makes the page fetch the replies. */
  repliesFetched?: boolean;
  /** A wall that shows once 展开回复 is clicked. */
  wallOnReplies?: 'captcha' | null;
  wall?: 'captcha' | 'login' | null;
  /** What each look at the grid finds, in turn; the posts once these run out. */
  grid?: ('posts' | 'error')[];
  /** Whether the post's × shows. */
  closeShown?: boolean;
}) {
  const log: string[] = [];
  const tap = new FakeTap();
  let shownWall = wall;
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
    blocked: () => Promise.resolve(shownWall),
    waitForPosts: () => Promise.resolve(void log.push('wait for posts')),
    waitForPostsOrError: () => {
      const found = grid.shift() ?? 'posts';
      log.push(found === 'posts' ? 'wait for posts' : 'wait for posts: 服务异常');
      return Promise.resolve(found);
    },
    waitForRetry: () => Promise.resolve(void log.push('wait for 刷新')),
    clickRetry: () => {
      log.push('click 刷新');
      fetchNext();
      return Promise.resolve();
    },
    scrollPosts: () => {
      log.push('scroll');
      fetchNext();
      return Promise.resolve();
    },
    waitForPost: (i) => Promise.resolve(void log.push(`wait for post ${i}`)),
    clickPost: (i) => {
      log.push(`click post ${i}`);
      tap.push('comments', comments);
      return Promise.resolve();
    },
    waitForGuide: () => Promise.reject(new Error('timeout')),
    dismissGuide: () => Promise.resolve(void log.push('click 我知道了')),
    guideShown: () => Promise.resolve(false),
    clickGuideClose: () => Promise.resolve(void log.push('click popup ×')),
    waitForCommentsOrButton: () => {
      log.push('wait for comments');
      return Promise.resolve('comments');
    },
    clickCommentButton: () => Promise.resolve(void log.push('click comment button')),
    waitForComments: () => Promise.resolve(void log.push('wait for comments')),
    waitForClose: () => {
      log.push('wait for close');
      return closeShown ? Promise.resolve() : Promise.reject(new Error('timeout'));
    },
    clickClose: () => Promise.resolve(void log.push('click close')),
    pressEscape: () => Promise.resolve(void log.push('press Escape')),
    waitForReplies: (i) => {
      log.push(`wait for replies ${i}`);
      return repliesShown.includes(i) ? Promise.resolve() : Promise.reject(new Error('timeout'));
    },
    clickReplies: (i) => {
      log.push(`click replies ${i}`);
      if (repliesFetched) tap.push('replies', repliesBody(`c${i}`, [`回复${i}`, `第二条回复${i}`]));
      shownWall = wallOnReplies ?? shownWall;
      return Promise.resolve();
    },
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

  it('clicks 刷新 as a step after a look when the grid shows 服务异常, then reads the posts', async () => {
    const { posts, log } = setup({ pages: [{}, postsBody(['2', '1'], false)], grid: ['error'] });
    const list = await posts.list('SEC', () => false);
    expect(list.map((p) => p.id)).toEqual(['2', '1']);
    expect(log).toEqual([
      'wait 500',
      'open SEC',
      'wait for posts: 服务异常',
      'wait 3000',
      'wait for 刷新',
      'wait 500',
      'click 刷新',
      'wait for posts',
    ]);
  });

  it('stops the run when 服务异常 stays after three 刷新', async () => {
    const { posts, log } = setup({ pages: [], grid: ['error', 'error', 'error', 'error'] });
    await expect(posts.list('SEC', () => false)).rejects.toBeInstanceOf(ServiceErrorStopped);
    expect(log.filter((line) => line === 'click 刷新')).toHaveLength(3);
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

  it('closes the post with Escape after a pause when its × does not show', async () => {
    const { posts, log } = setup({ pages: [postsBody(['1'], false)], closeShown: false });
    await posts.list('SEC', () => true);
    log.length = 0;
    await posts.commentsAt(0);
    expect(log.slice(-3)).toEqual(['wait for close', 'wait 500', 'press Escape']);
  });

  it('opens the replies under the comments that ask, then the most liked, at most three, each as a step', async () => {
    const comments = commentsBody(
      ['普通', '这是什么梗', '还行', '最多赞', '没有回复的'],
      [2, 3, 1, 5, 0],
    );
    const { posts, log } = setup({
      pages: [postsBody(['1'], false)],
      comments,
      repliesShown: [1, 3],
    });
    await posts.list('SEC', () => true);
    log.length = 0;
    const read = await posts.commentsAt(0);
    expect(log).toEqual([
      'wait for post 0',
      'wait 500',
      'click post 0',
      'wait for comments',
      'wait 1500',
      // 这是什么梗 asks; then by likes: 最多赞 (4), 还行 (2). 没有回复的 has none, so it's never tried.
      'wait for replies 1',
      'wait 500',
      'click replies 1',
      'wait 1200',
      'wait for replies 3',
      'wait 500',
      'click replies 3',
      'wait 1200',
      // Its button doesn't show: no replies, and the run goes on.
      'wait for replies 2',
      'wait for close',
      'wait 500',
      'click close',
    ]);
    expect(read[1]).toMatchObject({ text: '这是什么梗', asks: true });
    expect(read[1]!.replies!.map((r) => r.text)).toEqual(['回复1', '第二条回复1']);
    expect(read[3]!.replies!.map((r) => r.text)).toEqual(['回复3', '第二条回复3']);
    expect(read[2]!.replies).toBeUndefined();
    expect(JSON.stringify(read)).not.toContain('回复的人');
  });

  it('goes on without replies when 展开回复 fetches nothing', async () => {
    const { posts } = setup({
      pages: [postsBody(['1'], false)],
      comments: commentsBody(['啥意思'], [2]),
      repliesShown: [0],
      repliesFetched: false,
    });
    await posts.list('SEC', () => true);
    const read = await posts.commentsAt(0);
    expect(read).toEqual([
      { text: '啥意思', likes: 0, postedAt: null, id: 'c0', replyCount: 2, asks: true },
    ]);
  });

  it('stops at a captcha that shows after 展开回复', async () => {
    const { posts } = setup({
      pages: [postsBody(['1'], false)],
      comments: commentsBody(['啥意思'], [2]),
      repliesShown: [0],
      wallOnReplies: 'captcha',
    });
    await posts.list('SEC', () => true);
    await expect(posts.commentsAt(0)).rejects.toBeInstanceOf(BlockedError);
  });
});
