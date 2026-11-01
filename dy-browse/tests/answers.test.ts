import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  readComments,
  readFeed,
  readRelated,
  readReplies,
  readSearch,
  readUserPosts,
} from '../src/douyin/answers';

// The fixtures are hand-written guesses, marked so in each file (see README).
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('readFeed', () => {
  const { items, hasMore } = readFeed(fixture('feed.json'));

  it('reads every item that has an id, and says there is more', () => {
    expect(items.map((i) => i.id)).toEqual([
      '7300000000000000001',
      '7300000000000000002',
      '7300000000000000003',
      '7300000000000000004',
      '7300000000000000005',
    ]);
    expect(hasMore).toBe(true);
  });

  it('reads a video: text, hashtags once each, music, stats, author, duration, date, play url', () => {
    expect(items[0]).toEqual({
      id: '7300000000000000001',
      url: 'https://www.douyin.com/video/7300000000000000001',
      desc: '新出的鸣潮角色太帅了 #鸣潮 #今汐 @某人',
      hashtags: ['鸣潮', '今汐'],
      music: { title: '原声 - 某某', author: '某某' },
      author: { nickname: '游戏剪辑君', secUid: 'MS4wLjABAAAAfake1' },
      stats: { likes: 12000, comments: 345, shares: 67 },
      durationMs: 15200,
      kind: 'video',
      postedAt: 1761955200000,
      playUrl: 'https://v26.example.invalid/video/tos/1.mp4',
      imageUrls: [],
    });
  });

  it('tells an image post, an ad, a live card and a shop card from a video', () => {
    expect(items.map((i) => i.kind)).toEqual(['video', 'images', 'ad', 'live', 'shop']);
    expect(items[1]!.imageUrls).toHaveLength(2);
    expect(items[1]!.url).toContain('/note/');
    expect(items[1]!.playUrl).toBeNull();
  });

  it('gives nothing for a body that is not JSON, or has no list', () => {
    expect(readFeed('<html>').items).toEqual([]);
    expect(readFeed('{"status_code": 0}')).toEqual({ items: [], hasMore: false });
    expect(readFeed('[1,2]').items).toEqual([]);
  });
});

describe('readUserPosts', () => {
  it('reads the posts, newest first as given', () => {
    const { items, hasMore } = readUserPosts(fixture('posts.json'));
    expect(items.map((i) => i.id)).toEqual([
      '7400000000000000003',
      '7400000000000000002',
      '7400000000000000001',
    ]);
    expect(items[0]!.music).toEqual({ title: '海阔天空', author: 'Beyond' });
    expect(hasMore).toBe(true);
  });
});

describe('readSearch', () => {
  it('reads aweme_info entries and the items of a mix', () => {
    const { items } = readSearch(fixture('search.json'));
    expect(items.map((i) => i.id)).toEqual([
      '7500000000000000001',
      '7500000000000000002',
      '7500000000000000003',
    ]);
    expect(items[0]!.hashtags).toEqual(['鸣潮', '3.0']);
  });

  it('reads the related searches once each, empty ones left out', () => {
    expect(readRelated(fixture('search.json'))).toEqual(['鸣潮 卡池', '鸣潮 今汐', '鸣潮 抽卡']);
    expect(readRelated('nope')).toEqual([]);
  });

  it('reads every chunk of a streamed search body, and the searches suggested on each result', () => {
    const chunk = (ids: string[], words: string[]) =>
      JSON.stringify({
        status_code: 0,
        has_more: 1,
        data: ids.map((id) => ({
          type: 1,
          aweme_info: {
            aweme_id: id,
            desc: `视频${id}`,
            suggest_words: { suggest_words: [{ words: words.map((word) => ({ word })) }] },
          },
        })),
      });
    // As general/search/stream/ sends it: a hex length line before each JSON line.
    const body = [
      'e4c2',
      chunk(['1'], ['虚拟主播']),
      '7b6',
      '{"time_cost":{}}',
      'bda7b',
      chunk(['2', '3'], ['默播', '虚拟主播']),
    ].join('\n');
    const { items, hasMore } = readSearch(body);
    expect(items.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(hasMore).toBe(true);
    expect(readRelated(body)).toEqual(['虚拟主播', '默播']);
  });
});

describe('readComments', () => {
  const body = fixture('comments.json');
  const { items } = readComments(body);

  it('copies text, likes, date, its own id and reply count, and leaves blank comments out', () => {
    expect(items).toEqual([
      {
        text: '这个梗我也刷到好几次了',
        likes: 321,
        postedAt: 1761960000000,
        id: 'c1',
        replyCount: 4,
      },
      { text: '求出处', likes: 12, postedAt: 1761960900000, id: 'c3', replyCount: 0 },
    ]);
  });

  it('keeps nothing of who wrote them: no uid, nickname or avatar at any depth', () => {
    const out = JSON.stringify(items);
    for (const key of ['uid', 'sec_uid', 'nickname', 'avatar', 'user'])
      expect(out).not.toContain(key);
    for (const name of ['路人甲秘密昵称', '路人乙秘密昵称', '999111'])
      expect(out).not.toContain(name);
    for (const comment of items)
      expect(Object.keys(comment).sort()).toEqual([
        'id',
        'likes',
        'postedAt',
        'replyCount',
        'text',
      ]);
  });
});

describe('readReplies', () => {
  const body = fixture('replies.json');
  const { items, hasMore } = readReplies(body);

  it('reads each reply with the comment it is under, blank ones left out', () => {
    expect(items).toEqual([
      {
        parentId: 'c1',
        reply: { text: '是去年那个直播切片里出来的', likes: 45, postedAt: 1761961000000, id: 'r1' },
      },
      {
        parentId: 'c1',
        reply: { text: '对，原视频已经删了', likes: 3, postedAt: 1761961200000, id: 'r3' },
      },
    ]);
    expect(hasMore).toBe(true);
    expect(readReplies('nope')).toEqual({ items: [], hasMore: false });
  });

  it('keeps nothing of who wrote them', () => {
    const out = JSON.stringify(items);
    for (const key of ['uid', 'sec_uid', 'nickname', 'avatar', 'user'])
      expect(out).not.toContain(key);
    for (const name of ['路人丁秘密昵称', '路人戊秘密昵称', '999333'])
      expect(out).not.toContain(name);
  });
});
