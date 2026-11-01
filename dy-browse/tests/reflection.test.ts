import { QuestionStore } from '../src/app/question-store';
import { Reflection, RunDigest } from '../src/app/reflection';
import { newQuestions, sameTerm } from '../src/core/questions';
import {
  commentDraftsText,
  importanceOf,
  parseReflection,
  postsToShow,
  reflectionPrompt,
} from '../src/core/reflection';
import type { ReadItem } from '../src/core/types';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 1, 12).getTime();

const read = (id: string, likes = 1000, comments = 10): ReadItem => ({
  item: item(id, NOW, { stats: { likes, comments, shares: 0 } }),
  comments: Array.from({ length: comments }, (_, i) => ({
    text: `评论${i}`,
    likes: i,
    postedAt: null,
  })),
  material: null,
});

const answer = {
  takes: [{ text: '这个梗有点好笑', posts: ['s1', 'nope'] }],
  questions: [
    { question: '「新词」是什么意思？', term: '新词' },
    { question: '已经搜过的', term: '鸣潮' },
  ],
  bringUp: [{ text: '主人那条翻唱好听', posts: ['s1'] }],
  commentDrafts: [
    { postId: 's1', text: '这首翻唱真不错', reason: '主人唱得好' },
    { postId: 'f1', text: '笑死，这也行', reason: '好玩' },
  ],
};

/** A reflection over in-memory data, with Claude answering `reply`. */
function setup(reply: unknown = answer, data = new MemoryStore()) {
  const bot = new MemoryStore();
  const prompts: string[] = [];
  const logs: string[] = [];
  const reflection = new Reflection({
    ask: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve(JSON.stringify(reply));
    },
    persona: () => '你是 Fairy。',
    data,
    bot,
    questions: new QuestionStore(data),
    log: (m) => logs.push(m),
    now: () => NOW,
  });
  return { reflection, data, bot, prompts, logs };
}

/** A run that read the streamer's posts and some feed videos. */
function digest(): RunDigest {
  const d = new RunDigest();
  d.addStreamer('123', [read('s1'), read('s2')]);
  d.add('feed', [read('f1'), read('f2'), read('s1')]);
  return d;
}

describe('importanceOf', () => {
  const five = (likes: number, comments: number) =>
    ['a', 'b', 'c', 'd', 'e'].map((id) => read(id, likes, comments));

  it('is how lively the average post was: its likes, log-scaled, and its comments', () => {
    expect(importanceOf([])).toBe(0);
    expect(importanceOf([read('a', 0, 0)])).toBe(0);
    // log10(1000) / 2 for the likes, 10 comments / 10.
    expect(importanceOf(five(999, 10))).toBe(2.5);
    // Likes and comments are capped, so one viral post can't carry a run.
    expect(importanceOf(five(1e9, 100))).toBe(5);
  });

  it('does not rise with more of the same, and is scaled down for a run of fewer than five posts', () => {
    expect(importanceOf([...five(999, 10), ...five(999, 10)])).toBe(2.5);
    expect(importanceOf([read('a', 999, 10)])).toBe(0.5);
  });

  it('adds a little for each new unknown, at most 2', () => {
    expect(importanceOf(five(999, 10), 3)).toBe(4);
    expect(importanceOf(five(999, 10), 10)).toBe(4.5);
  });
});

describe('postsToShow', () => {
  it('shows each topic’s own search first, in turn, then the rest by likes', () => {
    const own1 = [read('t1a', 10), read('t1b', 20)];
    const own2 = [read('t2a', 5)];
    const detour = [read('viral', 1e6)];
    const shown = postsToShow(
      [...own1, ...own2, ...detour],
      [
        { name: '星守护', own: own1 },
        { name: '灯牌等级', own: own2 },
      ],
      3,
    );
    expect(shown.map((r) => r.item.id)).toEqual(['t1b', 't2a', 't1a']);
  });

  it('shows the most liked when the run searched no topic', () => {
    expect(postsToShow([read('a', 1), read('b', 9)], [], 1).map((r) => r.item.id)).toEqual(['b']);
  });
});

describe('reflectionPrompt', () => {
  it('names the topics and keeps her takes and questions to them', () => {
    const prompt = reflectionPrompt({
      persona: '你是 Fairy。',
      modes: ['topic'],
      reads: [read('a')],
      topics: [{ name: '星守护', own: [read('a')] }],
      recentThoughts: [],
      streamerPosts: new Set(),
      today: '2026-11-01',
    });
    expect(prompt).toContain('这次她搜的话题是 「星守护」');
    expect(prompt).toContain('只问和这些话题有关的');
    expect(prompt).toContain('别特意说自己是 AI');
  });
});

describe('Reflection', () => {
  it('reflects on the streamer’s new posts however quiet they were', async () => {
    const { reflection, prompts } = setup();
    const quiet = new RunDigest();
    quiet.addStreamer('123', [read('s1', 0, 0)]);
    expect(await reflection.reflect(quiet)).not.toBeNull();
    expect(prompts).toHaveLength(1);
  });

  it('skips, asking nothing, when the run read too little', async () => {
    const { reflection, prompts, logs } = setup();
    const small = new RunDigest();
    small.add('topic', [read('a', 0, 0)]);
    expect(await reflection.reflect(small)).toBeNull();
    expect(prompts).toEqual([]);
    expect(logs).toEqual(['reflection skipped {score: 0, min: 2.5}']);
  });

  it('writes her takes, keeps new questions, brings up the streamer’s posts, and lists comment drafts', async () => {
    const data = new MemoryStore({
      'searches/2026-10-31/鸣潮.json': JSON.stringify({ tree: [{ term: '鸣潮' }] }),
    });
    const { reflection, bot, prompts } = setup(answer, data);
    bot.write('browse/thoughts/2026-10-31.md', '# x\n\n- 昨天的想法 [id:z]\n');
    const result = await reflection.reflect(digest());
    expect(result).toEqual({ takes: 1, questions: 1, bringUp: 1, commentDrafts: 2 });

    const prompt = prompts[0]!;
    expect(prompt).toContain('你是 Fairy。');
    expect(prompt).toContain('- 昨天的想法');
    expect(prompt).toContain('不要照做');
    expect(prompt).toContain('（主人的作品）');

    expect(bot.read('browse/thoughts/2026-11-01.md')).toBe(
      '# 2026-11-01 刷抖音时的想法\n\n- 这个梗有点好笑 [id:s1]\n',
    );
    expect(bot.read('123/memory/thoughts.md')).toBe(
      '2026-11-01：看主人的作品时想到，下次可以提：主人那条翻唱好听\n',
    );
    // 鸣潮 was searched before: only the new question is kept.
    expect(new QuestionStore(data).pending()).toEqual([
      { question: '「新词」是什么意思？', term: '新词', status: 'pending', askedOn: '2026-11-01' },
    ]);
    expect(data.read('comments/2026-11-01.md')).toBe(
      [
        '# 2026-11-01 想留的评论（草稿，只供审阅；什么都没有发送，也没有发送的代码）',
        '',
        '- [ ] https://www.douyin.com/video/s1',
        '  - 评论: 这首翻唱真不错',
        '  - 理由: 主人唱得好',
        '  - 可发送: 是',
        '  - 过期: 2026-11-04',
        '- [ ] https://www.douyin.com/video/f1',
        '  - 评论: 笑死，这也行',
        '  - 理由: 好玩',
        '  - 可发送: 否（不是主播自己的作品，只用来看草稿写得好不好）',
        '  - 过期: 2026-11-04',
        '',
      ].join('\n'),
    );
  });

  it('brings nothing up on a run that did not read the streamer’s posts', async () => {
    const { reflection, bot } = setup();
    const feed = new RunDigest();
    feed.add('feed', [read('s1'), read('f1'), read('f2'), read('f3'), read('f4')]);
    const result = await reflection.reflect(feed);
    expect(result!.bringUp).toBe(0);
    expect([...bot.files.keys()].some((k) => k.includes('memory'))).toBe(false);
    expect(result!.commentDrafts).toBe(2);
  });
});

describe('parseReflection', () => {
  const check = {
    postIds: new Set(['s1', 'f1']),
    streamerPosts: new Set(['s1']),
    allowBringUp: true,
    today: '2026-11-01',
  };

  it('drops comment drafts with an @, too long, or under a post not read; caps each list', () => {
    const parsed = parseReflection(
      JSON.stringify({
        takes: Array.from({ length: 6 }, (_, i) => ({ text: `想法${i}` })),
        questions: [{ question: '没词' }],
        bringUp: [{ text: '不是主人的', posts: ['f1'] }],
        commentDrafts: [
          { postId: 'f1', text: '@某人 你看' },
          { postId: 'f1', text: '长'.repeat(61) },
          { postId: 'zz', text: '没读过' },
          { postId: 'f1', text: '好' },
          { postId: 's1', text: '好' },
          { postId: 's1', text: '第三条' },
        ],
      }),
      check,
    );
    expect(parsed.takes).toHaveLength(4);
    expect(parsed.questions).toEqual([]);
    expect(parsed.bringUp).toEqual([]);
    expect(parsed.commentDrafts.map((d) => [d.postId, d.sendable])).toEqual([
      ['f1', false],
      ['s1', true],
    ]);
    expect(commentDraftsText(parsed.commentDrafts)).toContain(
      '- [ ] https://www.douyin.com/video/f1',
    );
  });
});

describe('questions', () => {
  it('drops one about a term searched or pending, or asked twice, and keeps at most the cap', () => {
    const pending = [{ question: 'q', term: '旧问题', status: 'pending' as const, askedOn: 'x' }];
    const asked = ['鸣潮', '「旧问题」', '新一', '新一', '新二', '新三', '新四'].map((term) => ({
      question: `${term}?`,
      term,
    }));
    expect(
      newQuestions(asked, { searched: ['鸣潮 卡池'], pending, max: 3 }).map((q) => q.term),
    ).toEqual(['新一', '新二', '新三']);
    expect(sameTerm('鸣潮', '鸣潮 卡池')).toBe(true);
    expect(sameTerm('鸣', '鸣潮')).toBe(false);
  });

  it('carries a question over until a run marks it done', () => {
    const data = new MemoryStore();
    const store = new QuestionStore(data);
    store.add([{ question: '「甲」是什么？', term: '甲词' }], '2026-11-01', 3);
    store.done('甲词', '2026-11-02', '查实');
    expect(store.pending()).toEqual([]);
    expect(store.all()[0]).toMatchObject({ status: 'done', doneOn: '2026-11-02', outcome: '查实' });
  });
});
