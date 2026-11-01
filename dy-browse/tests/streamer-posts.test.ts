import type { UserPostsPort } from '../src/app/user-posts';
import { select, StreamerPosts } from '../src/app/streamer-posts';
import type { Comment } from '../src/core/types';
import { dateOf } from '../src/core/text';
import { resolveSecUid } from '../src/app/sec-uid';
import { RunStopped } from '../src/core/errors';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

const day = (d: number) => new Date(2026, 9, d, 12).getTime();

/** A user page with these posts (newest first), asked about by position. */
function fakePosts(posts: ReturnType<typeof item>[], comments: Record<string, Comment[]> = {}) {
  const asked: string[] = [];
  const port: UserPostsPort = {
    list: (secUid, until) => {
      asked.push(`list ${secUid}`);
      // Hand over the whole page; a real one scrolls until `until` is satisfied.
      void until(posts);
      return Promise.resolve(posts);
    },
    commentsAt: (index) => {
      const post = posts[index]!;
      asked.push(`comments ${post.id}`);
      return Promise.resolve(comments[post.id] ?? []);
    },
  };
  return { port, asked };
}

const answerFor = (ids: string[]) => JSON.stringify(ids.map((id) => ({ id, line: `写了${id}` })));

describe('StreamerPosts', () => {
  const posts = [
    item('p6', day(30)),
    item('p5', day(29)),
    item('p4', day(28)),
    item('p3', day(27)),
    item('p2', day(26)),
    item('p1', day(25)),
  ];

  it('on the first run reads the newest few, as older ones, and writes a dated line each', async () => {
    const data = new MemoryStore();
    const bot = new MemoryStore();
    const { port, asked } = fakePosts(posts, { p6: [{ text: '好听', likes: 3, postedAt: null }] });
    const prompts: string[] = [];
    const logs: string[] = [];
    const run = new StreamerPosts({
      posts: port,
      data,
      bot,
      log: (m) => logs.push(m),
      ask: (prompt) => {
        prompts.push(prompt);
        return Promise.resolve(answerFor(['p6', 'p5', 'p4']));
      },
    });
    const result = await run.run('416362684969', 'SEC');
    expect(result).toMatchObject({ new: 0, older: 3 });
    expect(asked).toEqual(['list SEC', 'comments p6', 'comments p5', 'comments p4']);
    expect(logs).toEqual(['posts read {new: 0, older: 3}']);
    expect(bot.read('416362684969/memory/posts.md')).toBe(
      `# 416362684969 主播的作品\n\n` +
        `- ${dateOf(day(30))}：写了p6 [id:p6]\n- ${dateOf(day(29))}：写了p5 [id:p5]\n- ${dateOf(day(28))}：写了p4 [id:p4]\n`,
    );
    expect(prompts[0]).toContain('好听');
    expect(prompts[0]).toContain('不要引用原话');
  });

  it('a second run reads the new post first, then the next older ones, none twice', async () => {
    const data = new MemoryStore();
    const bot = new MemoryStore();
    const ask = (ids: string[]) => () => Promise.resolve(answerFor(ids));
    await new StreamerPosts({
      posts: fakePosts(posts).port,
      data,
      bot,
      log: () => {},
      ask: ask(['p6', 'p5', 'p4']),
    }).run('1', 'SEC');
    const withNew = [item('p7', day(31)), ...posts];
    const { port, asked } = fakePosts(withNew);
    const result = await new StreamerPosts({
      posts: port,
      data,
      bot,
      log: () => {},
      ask: ask(['p7', 'p3', 'p2', 'p1']),
    }).run('1', 'SEC');
    expect(result).toMatchObject({ new: 1, older: 3 });
    expect(asked.filter((a) => a.startsWith('comments'))).toEqual([
      'comments p7',
      'comments p3',
      'comments p2',
      'comments p1',
    ]);
    const lines = bot
      .read('1/memory/posts.md')!
      .split('\n')
      .filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(7);
    expect(new Set(lines.map((l) => /\[id:(\w+)\]/.exec(l)![1])).size).toBe(7);
    // Everything is read now: a third run asks Claude nothing.
    const asks: string[] = [];
    const third = await new StreamerPosts({
      posts: fakePosts(withNew).port,
      data,
      bot,
      log: () => {},
      ask: (p) => (asks.push(p), Promise.resolve('[]')),
    }).run('1', 'SEC');
    expect(third).toMatchObject({ new: 0, older: 0 });
    expect(asks).toEqual([]);
  });

  it('writes the post description when the model gave no line for it', async () => {
    const data = new MemoryStore();
    const bot = new MemoryStore();
    await new StreamerPosts({
      posts: fakePosts([item('a', day(30), { desc: '一条没有回答的作品' })]).port,
      data,
      bot,
      log: () => {},
      ask: () => Promise.resolve('not json at all'),
    }).run('1', 'SEC');
    expect(bot.read('1/memory/posts.md')).toContain('一条没有回答的作品 [id:a]');
  });

  it('puts the posts through the reader for speech and picture text, when given one', async () => {
    const data = new MemoryStore();
    const bot = new MemoryStore();
    const prompts: string[] = [];
    await new StreamerPosts({
      posts: fakePosts([item('a', day(30))]).port,
      data,
      bot,
      log: () => {},
      reader: {
        read: () => Promise.resolve({ transcript: ['今天唱一首'], song: null, ocr: ['字幕内容'] }),
      },
      ask: (p) => (prompts.push(p), Promise.resolve('[]')),
    }).run('1', 'SEC');
    expect(prompts[0]).toContain('今天唱一首');
    expect(prompts[0]).toContain('字幕内容');
  });

  it('writes only what the posts file and the mark hold: nothing about commenters', async () => {
    const data = new MemoryStore();
    const bot = new MemoryStore();
    await new StreamerPosts({
      posts: fakePosts([item('a', day(30))], {
        a: [{ text: '路人说好', likes: 1, postedAt: null }],
      }).port,
      data,
      bot,
      log: () => {},
      ask: () => Promise.resolve(answerFor(['a'])),
    }).run('1', 'SEC');
    expect([...data.files.keys()]).toEqual(['streamer/1/mark.json']);
    expect([...bot.files.keys()]).toEqual(['1/memory/posts.md']);
    expect(bot.read('1/memory/posts.md')).not.toContain('路人');
  });
});

describe('select', () => {
  it('takes new posts newest first up to the cap, and a few older ones', () => {
    const list = [item('n2', 20), item('n1', 15), item('o2', 9), item('o1', 5), item('read', 8)];
    const picked = select(list, { newestAt: 10, readIds: ['read'] }, new Set(['read']), 1, 1);
    expect(picked.fresh.map((p) => p.id)).toEqual(['n2']);
    expect(picked.older.map((p) => p.id)).toEqual(['o2']);
  });
});

describe('resolveSecUid', () => {
  it('uses --sec-uid without opening the page', async () => {
    const opened: string[] = [];
    expect(await resolveSecUid('1', 'GIVEN', (r) => (opened.push(r), Promise.resolve('')))).toBe(
      'GIVEN',
    );
    expect(opened).toEqual([]);
  });

  it('otherwise reads it from the live room page like room-feed does', async () => {
    const html =
      '&quot;nickname&quot;:&quot;主播&quot;"anchor":{\\"id_str\\":\\"12\\",\\"sec_uid\\":\\"FROM_PAGE\\"}';
    expect(await resolveSecUid('7', null, () => Promise.resolve(html))).toBe('FROM_PAGE');
  });

  it('stops with a message when the page has none', async () => {
    await expect(resolveSecUid('7', null, () => Promise.resolve('<html/>'))).rejects.toBeInstanceOf(
      RunStopped,
    );
  });
});
