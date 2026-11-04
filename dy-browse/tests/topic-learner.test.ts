import { DraftStore } from '../src/app/draft-store';
import { TopicLearner } from '../src/app/topic-learner';
import type { SearchPort, SearchResult } from '../src/app/topic-search';
import { BlockedError, EmptyReadError } from '../src/core/errors';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';
import { parseSearchQuery } from '../src/core/prompts';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 1, 12).getTime();

/**
 * A search that answers from a table of what each term finds (an error: the search fails with it),
 * and logs what was searched.
 */
function fakeSearch(table: Record<string, Partial<SearchResult> | Error>) {
  const searched: string[] = [];
  const search: SearchPort = {
    search: (topic) => {
      searched.push(topic);
      const found = table[topic] ?? {};
      if (found instanceof Error) return Promise.reject(found);
      return Promise.resolve({ topic, hot: [], newest: [], related: [], comments: {}, ...found });
    },
  };
  return { search, searched };
}

type PromptKind = 'keywords' | 'understand' | 'kb' | 'douyin' | 'query' | 'drafts';

/** Which question a prompt is. */
function kindOf(prompt: string): PromptKind {
  if (prompt.includes('写一个在抖音搜索框里搜的词')) return 'query';
  if (prompt.includes('从候选里挑')) return 'keywords';
  if (prompt.includes('请读懂它们')) return 'understand';
  if (prompt.includes('我们知识库里可能相关的条目')) return 'kb';
  if (prompt.includes('我们为了这个问题在抖音上搜了')) return 'douyin';
  return 'drafts';
}

/**
 * A Claude that answers each question from scripts: the keywords, the drafts, what a search leaves
 * unknown (by the term searched), the judgements of the knowledge base and of Douyin, and the query
 * for a topic's search.
 */
function fakeAsk(
  options: {
    keywords?: unknown;
    drafts?: unknown;
    understand?: Record<string, unknown>;
    kb?: unknown;
    douyin?: unknown;
    query?: unknown;
  } = {},
) {
  const prompts: { kind: PromptKind; text: string }[] = [];
  const ask = (prompt: string) => {
    const kind = kindOf(prompt);
    prompts.push({ kind, text: prompt });
    const term = /搜了「(.+?)」/.exec(prompt)?.[1] ?? '';
    const answer = {
      keywords: options.keywords ?? [],
      understand: options.understand?.[term] ?? {},
      kb: options.kb ?? { supports: 'none', answer: '' },
      douyin: options.douyin ?? { supports: 'none', answer: '' },
      query: options.query ?? {},
      drafts: options.drafts ?? { entries: [], stillRight: [] },
    }[kind];
    return Promise.resolve(JSON.stringify(answer));
  };
  return { ask, prompts };
}

/** A web Claude answering from a script, logging each question. */
function fakeWeb(answer: unknown = { supports: 'none', answer: '' }) {
  const asked: string[] = [];
  const askWeb = (prompt: string) => {
    asked.push(prompt);
    return Promise.resolve(JSON.stringify(answer));
  };
  return { askWeb, asked };
}

const tagged = (id: string, ...tags: string[]) =>
  item(id, NOW, { hashtags: tags, desc: `视频${id}` });

function build(
  table: Record<string, Partial<SearchResult> | Error>,
  claude: Parameters<typeof fakeAsk>[0],
  options: {
    depth?: number;
    maxSearches?: number;
    maxUnknowns?: number;
    knowledge?: string;
    web?: unknown;
    data?: MemoryStore;
    snapshot?: (name: string) => Promise<string | null>;
  } = {},
) {
  const data = options.data ?? new MemoryStore();
  const { search, searched } = fakeSearch(table);
  const { ask, prompts } = fakeAsk(claude);
  const { askWeb, asked } = fakeWeb(options.web);
  const logs: string[] = [];
  const learner = new TopicLearner({
    search,
    ask,
    askWeb,
    maxUnknowns: options.maxUnknowns,
    data,
    drafts: new DraftStore(data),
    index: new KnowledgeIndex(parseKnowledge(options.knowledge ?? '')),
    log: (m) => logs.push(m),
    snapshot: options.snapshot,
    now: () => NOW,
    depth: options.depth,
    maxSearches: options.maxSearches,
  });
  return { learner, data, searched, prompts, logs, webAsked: asked };
}

const table = {
  鸣潮: {
    hot: [tagged('a', '今汐'), tagged('b', '今汐')],
    newest: [tagged('c', '抽卡')],
    related: ['鸣潮 卡池'],
  },
  今汐: { hot: [tagged('d', '今汐')] },
  抽卡: { hot: [tagged('e')] },
  '鸣潮 卡池': { hot: [tagged('f')] },
};

describe('TopicLearner', () => {
  it('at depth 0 searches only the topic, reads it and writes drafts with where they came from', async () => {
    const drafts = {
      entries: [
        {
          kind: 'new',
          title: '今汐',
          aliases: ['今夕'],
          type: '事实',
          asOf: '2026-11',
          body: '鸣潮的角色。',
          from: '鸣潮',
          sources: ['a', 'b'],
        },
      ],
      stillRight: [],
    };
    const { learner, data, searched, logs, prompts } = build(table, { drafts }, { depth: 0 });
    const result = await learner.learn('鸣潮', { folder: 'topics' });
    expect(searched).toEqual(['鸣潮']);
    expect(prompts.map((p) => p.kind)).toEqual(['understand', 'drafts']);
    expect(result).toMatchObject({ searches: 1, found: 3, drafts: 1 });
    expect(data.read('knowledge/pending/topics/2026-11-01.md')).toBe(
      [
        '## 今汐',
        'aliases: 今夕',
        '类型: 事实',
        '截至: 2026-11',
        // A 事实 is checked again in 90 days.
        '复查: 2027-01-30',
        '来源: 抖音搜索「鸣潮」；视频 a、b（2026-11-01 学到）',
        '',
        '鸣潮的角色。',
        '',
      ].join('\n'),
    );
    expect(logs[0]).toBe('topic searched {topic: 鸣潮, hot: 2, newest: 1, keywords: 0}');
    expect(logs.at(-1)).toContain('drafts written');
  });

  it('follows the keywords Claude picks from the candidates, and ignores any it made up', async () => {
    const keywords = [
      { keyword: '今汐', reason: '出现最多' },
      { keyword: '自己编的词', reason: '不在候选里' },
    ];
    const { learner, searched, prompts } = build(table, { keywords }, { depth: 1 });
    await learner.learn('鸣潮', { folder: 'topics' });
    expect(searched).toEqual(['鸣潮', '今汐']);
    // Candidates are listed for Claude, counted by code.
    const asked = prompts.find((p) => p.kind === 'keywords')!.text;
    expect(asked).toContain('今汐（hashtag，2）');
    expect(asked).toContain('鸣潮 卡池（related，0）');
  });

  it('goes only `depth` levels down and at most `maxSearches` in all', async () => {
    const deep = {
      鸣潮: { hot: [tagged('a', '今汐', '抽卡')], related: ['鸣潮 卡池'] },
      今汐: { hot: [tagged('b', '二级词')] },
      抽卡: { hot: [tagged('c')] },
      '鸣潮 卡池': { hot: [tagged('d')] },
    };
    const keywords = [
      { keyword: '今汐', reason: '' },
      { keyword: '抽卡', reason: '' },
      { keyword: '鸣潮 卡池', reason: '' },
    ];
    const one = build(deep, { keywords }, { depth: 1, maxSearches: 2 });
    await one.learner.learn('鸣潮', { folder: 'topics' });
    expect(one.searched).toEqual(['鸣潮', '今汐']);
    const wide = build(deep, { keywords }, { depth: 1, maxSearches: 6 });
    await wide.learner.learn('鸣潮', { folder: 'topics' });
    // 二级词 is a candidate of 今汐's posts but depth 1 stops there.
    expect(wide.searched).toEqual(['鸣潮', '今汐', '抽卡', '鸣潮 卡池']);
  });

  it('skips a search that fails on its own, says so, and goes on', async () => {
    const failing = {
      ...table,
      今汐: new Error('locator.waitFor: Timeout 20000ms exceeded.\nCall log: …'),
    };
    const keywords = [
      { keyword: '今汐', reason: '' },
      { keyword: '抽卡', reason: '' },
    ];
    const { learner, searched, logs } = build(failing, { keywords }, { depth: 1 });
    await learner.learn('鸣潮', { folder: 'topics' });
    expect(searched).toEqual(['鸣潮', '今汐', '抽卡']);
    expect(logs).toContain(
      'search skipped {term: 今汐, why: locator.waitFor: Timeout 20000ms exceeded.}',
    );
  });

  it('takes a screenshot of a skipped search and says where it is', async () => {
    const failing = { ...table, 今汐: new Error('locator.hover: Timeout 10000ms exceeded.') };
    const shots: string[] = [];
    const { learner, logs } = build(
      failing,
      { keywords: [{ keyword: '今汐', reason: '' }] },
      {
        depth: 1,
        snapshot: (name) => (shots.push(name), Promise.resolve(`screenshots/${name}.png`)),
      },
    );
    await learner.learn('鸣潮', { folder: 'topics' });
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatch(/-search-skipped$/);
    expect(logs).toContain(
      `search skipped {term: 今汐, why: locator.hover: Timeout 10000ms exceeded., screenshot: screenshots/${shots[0]}.png}`,
    );
  });

  it('still stops at a captcha or login wall in any search', async () => {
    const walled = { ...table, 今汐: new BlockedError('captcha') };
    const { learner } = build(
      walled,
      { keywords: [{ keyword: '今汐', reason: '' }] },
      { depth: 1 },
    );
    await expect(learner.learn('鸣潮', { folder: 'topics' })).rejects.toBeInstanceOf(BlockedError);
  });

  it('does not search a term the knowledge base already has', async () => {
    const { learner, prompts } = build(
      table,
      { keywords: [{ keyword: '今汐', reason: '' }] },
      {
        knowledge: '## 今汐\n\n鸣潮的角色。',
      },
    );
    await learner.learn('鸣潮', { folder: 'topics' });
    expect(prompts.find((p) => p.kind === 'keywords')!.text).not.toContain('今汐（');
  });

  it('keeps the tree it walked, and quotes the path in a draft found under a keyword', async () => {
    const drafts = {
      entries: [{ kind: 'new', title: '新词', body: '说明', from: '今汐', sources: ['d'] }],
    };
    const { learner, data } = build(table, {
      keywords: [{ keyword: '今汐', reason: '多' }],
      drafts,
    });
    await learner.learn('鸣潮', { folder: 'topics' });
    const tree = JSON.parse(data.read('searches/2026-11-01/鸣潮.json')!) as {
      tree: { term: string; parent: string | null }[];
    };
    expect(tree.tree.map((n) => [n.term, n.parent])).toEqual([
      ['鸣潮', null],
      ['今汐', '鸣潮'],
    ]);
    expect(data.read('knowledge/pending/topics/2026-11-01.md')).toContain(
      '来源: 抖音搜索「鸣潮」→「今汐」；视频 d',
    );
  });

  it('writes nothing, and asks Claude nothing more, when the search found no posts', async () => {
    const { learner, data, prompts } = build({}, {});
    const result = await learner.learn('没人说的词', { folder: 'topics' });
    expect(result).toMatchObject({ found: 0, drafts: 0 });
    expect(prompts).toEqual([]);
    expect([...data.files.keys()].some((k) => k.startsWith('knowledge/pending'))).toBe(false);
  });

  it('writes a change to an existing entry, and "still right" as a plain list, not a draft', async () => {
    const knowledge = '## 艾莲\n类型: 事实\n\n旧的说明。\n\n## 雅\n\n另一个。';
    const drafts = {
      entries: [
        {
          kind: 'change',
          title: '艾莲',
          type: '事实',
          body: '新的说明。',
          change: '改版后技能变了',
          from: '艾莲',
          sources: ['a'],
        },
        // Claimed as a change, but there's no such entry: it's a new one.
        { kind: 'change', title: '不存在', body: '正文', from: '艾莲' },
      ],
      stillRight: ['雅', '不存在'],
    };
    const { learner, data } = build(
      { 艾莲: { hot: [tagged('a')] } },
      { drafts },
      { depth: 0, knowledge },
    );
    const entries = parseKnowledge(knowledge, 'zzz');
    const result = await learner.learn('艾莲', { folder: 'zzz', existing: entries });
    expect(result).toMatchObject({ drafts: 2, stillRight: 1 });
    const file = data.read('knowledge/pending/zzz/2026-11-01.md')!;
    expect(file).toContain('（修改已有条目）变化：改版后技能变了');
    expect(file).toContain('## 不存在');
    expect(file).not.toContain('变化：见下\n\n正文\n\n（修改');
    // The "still right" ones are a list of titles, not entries.
    expect(data.read('knowledge/pending/still-right-2026-11-01.md')).toBe(
      '# 仍然正确（只需把复查日期往后挪，不用改内容）\n\n- zzz/雅\n',
    );
    expect([...data.files.keys()].filter((k) => k.startsWith('knowledge/pending')).sort()).toEqual([
      'knowledge/pending/still-right-2026-11-01.md',
      'knowledge/pending/zzz/2026-11-01.md',
    ]);
  });

  it('adds a second topic to the same day file', async () => {
    const draft = (title: string) => ({ entries: [{ kind: 'new', title, body: '正文' }] });
    const one = build({ a: { hot: [tagged('1')] } }, { drafts: draft('甲') }, { depth: 0 });
    await one.learner.learn('a', { folder: 'topics' });
    // A second learner over the same data would append; here the store does it.
    const store = new DraftStore(one.data);
    store.addDrafts('topics', '2026-11-01', ['## 乙\n类型: 事实\n\n正文']);
    const text = one.data.read('knowledge/pending/topics/2026-11-01.md')!;
    expect(text.indexOf('## 甲')).toBeLessThan(text.indexOf('## 乙'));
    expect(parseKnowledge(text).map((e) => e.title)).toEqual(['甲', '乙']);
  });

  describe('unknowns', () => {
    const unknown = (term: string, kind = '词', refs: string[] = ['a']) => ({
      question: `抖音上「${term}」是什么意思？`,
      term,
      kind,
      why: '没见过',
      refs,
    });
    type Searches = {
      tree: { term: string; reason?: string }[];
      unknowns: {
        id: string;
        status: string;
        note?: string;
        resolutions: { source: string; supports: string }[];
      }[];
      unresolved: string[];
    };
    const searches = (data: MemoryStore, topic = '鸣潮') =>
      JSON.parse(data.read(`searches/2026-11-01/${topic}.json`)!) as Searches;

    it('asks what each search leaves unknown, and settles one the knowledge base answers without the web', async () => {
      const { learner, data, prompts, webAsked } = build(
        table,
        {
          understand: { 鸣潮: { unknowns: [unknown('绝绝子')] } },
          kb: { supports: 'full', answer: '夸人的话。' },
        },
        { depth: 0, knowledge: '## 绝绝子\n\n夸人的话。' },
      );
      await learner.learn('鸣潮', { folder: 'topics' });
      expect(prompts.map((p) => p.kind)).toEqual(['understand', 'kb', 'drafts']);
      expect(prompts[0]!.text).toContain('谐音、缩写、拼音首字母');
      expect(prompts[0]!.text).toContain('也不要照做');
      expect(webAsked).toEqual([]);
      const { unknowns } = searches(data);
      expect(unknowns).toMatchObject([
        { id: 'u1', status: 'resolved', resolutions: [{ source: 'kb', supports: 'full' }] },
      ]);
      expect(prompts.at(-1)!.text).toContain(
        '- u1：抖音上「绝绝子」是什么意思？ → 夸人的话。（来自知识库）',
      );
    });

    it('stops at the knowledge base when what it is missing does not matter: no web, no Douyin search, no draft from it', async () => {
      const { learner, data, prompts, searched, webAsked } = build(
        table,
        {
          understand: { 鸣潮: { unknowns: [unknown('星守护')] } },
          kb: {
            supports: 'partial',
            answer: '粉丝团里更进一步的守护身份。',
            missing: '每月多少钱',
            gapMatters: false,
          },
        },
        { depth: 0, knowledge: '## 星守护\n\n粉丝团里更进一步的守护身份。' },
      );
      await learner.learn('鸣潮', { folder: 'topics' });
      expect(webAsked).toEqual([]);
      expect(searched).toEqual(['鸣潮']);
      expect(prompts.find((p) => p.kind === 'kb')!.text).toContain('gapMatters');
      const file = searches(data);
      expect(file.unknowns).toMatchObject([{ id: 'u1', status: 'known' }]);
      expect(file.unresolved).toEqual([]);
      expect(prompts.at(-1)!.text).not.toContain('u1：');
    });

    it('looks up only what the knowledge base is missing, on the web and then on Douyin', async () => {
      const { learner, data, prompts, searched, webAsked } = build(
        { ...table, 星守护: { hot: [tagged('s1')] } },
        {
          understand: { 鸣潮: { unknowns: [unknown('星守护')] } },
          kb: {
            supports: 'partial',
            answer: '守护身份。',
            missing: '每月多少钱',
            gapMatters: true,
          },
          douyin: { supports: 'full', answer: '守护身份，每月 128 元。', refs: ['s1'] },
        },
        {
          depth: 0,
          knowledge: '## 星守护\n\n守护身份。',
          web: { supports: 'partial', answer: '守护身份，价格各说不一。', missing: '每月多少钱' },
        },
      );
      await learner.learn('鸣潮', { folder: 'topics' });
      expect(webAsked[0]).toContain('前面已经查到：守护身份。');
      expect(webAsked[0]).toContain('只缺这一部分：每月多少钱');
      expect(searched).toEqual(['鸣潮', '星守护']);
      const judged = prompts.find((p) => p.kind === 'douyin')!.text;
      expect(judged).toContain('前面已经查到：守护身份，价格各说不一。');
      expect(judged).toContain('只缺这一部分：每月多少钱');
      expect(searches(data).unknowns[0]).toMatchObject({ status: 'resolved' });
    });

    it('goes to the web, then searches Douyin for it ahead of the keywords, and judges it on what that read', async () => {
      const { learner, data, prompts, searched, webAsked } = build(
        { ...table, XX梗: { hot: [tagged('x1'), tagged('x2')] } },
        {
          understand: { 鸣潮: { unknowns: [unknown('XX梗', '梗')] } },
          keywords: [{ keyword: '今汐', reason: '' }],
          douyin: { supports: 'full', answer: '一个直播切片里的话。', refs: ['x1'] },
        },
        { web: { supports: 'full', answer: '网上说是…', urls: ['https://example.invalid/x'] } },
      );
      await learner.learn('鸣潮', { folder: 'topics' });
      // A 梗's 出处 needs Douyin's own evidence: the web alone is only partial.
      expect(webAsked).toHaveLength(1);
      expect(webAsked[0]).toContain('小鸡词典');
      expect(searched).toEqual(['鸣潮', 'XX梗', '今汐']);
      expect(prompts.map((p) => p.kind)).toContain('douyin');
      const file = searches(data);
      expect(file.tree[1]).toMatchObject({
        term: 'XX梗',
        reason: '查证：抖音上「XX梗」是什么意思？',
      });
      expect(file.unknowns[0]!.resolutions.map((r) => [r.source, r.supports])).toEqual([
        ['kb', 'none'],
        ['web', 'partial'],
        ['douyin', 'full'],
      ]);
      expect(file.unknowns[0]!.status).toBe('resolved');
    });

    it('never drafts what stays unsettled: it is listed in the searches file and as 未确认 in the drafts file', async () => {
      const drafts = {
        entries: [
          { kind: 'new', title: '神秘词', type: '惯例', body: '编出来的意思', sources: ['a'] },
          { kind: 'new', title: '别的', type: '惯例', body: '正文', sources: ['a'] },
        ],
      };
      const { learner, data, searched } = build(
        { ...table, 神秘词: { hot: [tagged('m1')] } },
        { understand: { 鸣潮: { unknowns: [unknown('神秘词')] } }, drafts },
        { depth: 0 },
      );
      const result = await learner.learn('鸣潮', { folder: 'topics' });
      expect(searched).toEqual(['鸣潮', '神秘词']);
      expect(result).toMatchObject({ unknowns: 1, unresolved: 1, drafts: 1 });
      expect(searches(data).unresolved).toEqual(['抖音上「神秘词」是什么意思？']);
      const file = data.read('knowledge/pending/topics/2026-11-01.md')!;
      expect(file).not.toContain('## 神秘词');
      expect(file).toContain('## 别的');
      expect(file).toContain('## 未确认（「鸣潮」，2026-11-01）');
      expect(file).toContain('- 抖音上「神秘词」是什么意思？（kb: none；web: none；douyin: none）');
    });

    it('shares maxSearches: one with no search left is unresolved, and the cap on unknowns holds', async () => {
      const { learner, data, searched } = build(
        table,
        { understand: { 鸣潮: { unknowns: [unknown('甲词'), unknown('乙词')] } } },
        { depth: 0, maxSearches: 1, maxUnknowns: 1 },
      );
      await learner.learn('鸣潮', { folder: 'topics' });
      expect(searched).toEqual(['鸣潮']);
      expect(searches(data).unknowns).toMatchObject([
        { id: 'u1', status: 'unresolved', note: '没有搜索名额了' },
      ]);
    });
  });

  it('makes a 社区观点 card by code from opinions seen under two different creators, with both sides counted', async () => {
    const by = (id: string, who: string) =>
      item(id, NOW, {
        author: { nickname: who, secUid: who },
        stats: { likes: 100, comments: 3, shares: 0 },
      });
    const comment = (text: string, likes: number) => ({ text, likes, postedAt: null });
    const found = {
      hot: [by('a', '甲'), by('b', '乙'), by('c', '甲')],
      comments: {
        a: [comment('太难了', 20)],
        b: [comment('真的难', 10), comment('还好吧', 5)],
        c: [comment('角色好看', 7)],
      },
    };
    const understand = {
      opinions: [
        // a and b: two creators.
        { point: '新关卡太难', counter: '难度还行', refs: ['a#1', 'b#1'], counterRefs: ['b#2'] },
        // a and c are both 甲's: one creator, however liked.
        { point: '角色很好看', counter: null, refs: ['a', 'c#1'] },
      ],
    };
    const { learner, data } = build(
      { 鸣潮: found },
      { understand: { 鸣潮: understand } },
      { depth: 0 },
    );
    await learner.learn('鸣潮', { folder: 'topics' });
    const file = data.read('knowledge/pending/topics/2026-11-01.md')!;
    expect(file).toContain('## 鸣潮（大家怎么看）\n类型: 社区观点');
    expect(file).toContain('复查: 2026-11-22');
    expect(file).toContain(
      '- 听说抖音上有人觉得新关卡太难（2个作品/30赞），也有人觉得难度还行（1个作品/5赞）。',
    );
    expect(file).not.toContain('角色很好看');
    expect(file).toContain('来源: 抖音搜索「鸣潮」；视频 a、b');
  });

  it('makes one 社区观点 card for the topic, from the opinions of every search it made', async () => {
    const by = (id: string, who: string) =>
      item(id, NOW, { author: { nickname: who, secUid: who }, hashtags: ['今汐'] });
    const comment = (text: string) => ({ text, likes: 3, postedAt: null });
    const twoCreators = (point: string, a: string, b: string) => ({
      point,
      counter: null,
      refs: [`${a}#1`, `${b}#1`],
    });
    const found = {
      鸣潮: {
        hot: [by('a', '甲'), by('b', '乙')],
        comments: { a: [comment('x')], b: [comment('y')] },
      },
      今汐: {
        hot: [by('c', '丙'), by('d', '丁')],
        comments: { c: [comment('x')], d: [comment('y')] },
      },
    };
    const { learner, data } = build(
      found,
      {
        keywords: [{ keyword: '今汐', reason: '' }],
        understand: {
          鸣潮: { opinions: [twoCreators('新关卡太难', 'a', 'b')] },
          今汐: { opinions: [twoCreators('今汐很强', 'c', 'd')] },
        },
      },
      { depth: 1 },
    );
    await learner.learn('鸣潮', { folder: 'topics' });
    const file = data.read('knowledge/pending/topics/2026-11-01.md')!;
    expect(file.match(/（大家怎么看）/g)).toHaveLength(1);
    expect(file).toContain('## 鸣潮（大家怎么看）');
    expect(file).toContain('新关卡太难');
    expect(file).toContain('今汐很强');
  });

  it('looks a carried question up first, as the topic search’s first unknown, and says what came of it', async () => {
    const { learner, searched, webAsked, prompts } = build(
      { 问题词: { hot: [tagged('q1')] }, 别的: { hot: [tagged('z')] } },
      { douyin: { supports: 'full', answer: '是一个词。', refs: ['q1'] } },
      { depth: 0 },
    );
    const result = await learner.learn('问题词', {
      folder: 'topics',
      carry: { question: '「问题词」是什么？', why: '直播里有人问' },
    });
    expect(webAsked[0]).toContain('「问题词」是什么？');
    // Its Douyin search is the topic's own: searched once, judged on what it read. With nothing
    // found beforehand, the search is the topic as it is.
    expect(searched).toEqual(['问题词']);
    expect(prompts.some((p) => p.kind === 'query')).toBe(false);
    expect(result.carried).toEqual({ status: 'resolved', answer: '是一个词。', source: 'douyin' });
    expect(result.searchFile).toBe('searches/2026-11-01/问题词.json');
    // Not counted as an unknown the search raised.
    expect(result.unknowns).toBe(0);
    // Without a carry there's nothing to report.
    const other = await learner.learn('别的', { folder: 'topics' });
    expect(other.carried).toBeNull();
  });

  it('reports a carried question it could not settle, with why', async () => {
    const { learner } = build(
      { 问题词: { hot: [tagged('q1')] } },
      { douyin: { supports: 'none', answer: '', refs: [] } },
      { depth: 0 },
    );
    const result = await learner.learn('问题词', {
      folder: 'topics',
      carry: { question: '「问题词」是什么？' },
    });
    expect(result.carried).toMatchObject({ status: 'unresolved' });
  });

  describe('a carried question looked up before the search', () => {
    const web = {
      supports: 'partial',
      answer: '四个主播连线 PK，分成两队。',
      urls: ['https://example.com/a'],
    };

    it('aims the topic search with what the web found, and gives it to Claude as background', async () => {
      const { learner, data, searched, prompts, webAsked, logs } = build(
        { '抖音直播 PK 黑白配': { hot: [tagged('q1')] } },
        {
          query: { query: '抖音直播 PK 黑白配' },
          douyin: { supports: 'full', answer: '四人 PK 分黑白两队。', refs: ['q1'] },
        },
        { depth: 0, web },
      );
      const result = await learner.learn('黑白配', {
        folder: 'topics',
        carry: { question: '「黑白配」在 PK 里是什么意思？' },
      });
      expect(webAsked).toHaveLength(1);
      const query = prompts.find((p) => p.kind === 'query')!.text;
      expect(query).toContain('「黑白配」在 PK 里是什么意思？');
      expect(query).toContain('四个主播连线 PK，分成两队。');
      expect(searched).toEqual(['抖音直播 PK 黑白配']);
      expect(logs).toContain('search query {topic: 黑白配, query: 抖音直播 PK 黑白配}');
      // The background reaches the reading of the topic's posts.
      expect(prompts.find((p) => p.kind === 'understand')!.text).toContain(
        '四个主播连线 PK，分成两队。',
      );
      // The walk keeps the topic as the search's term, and says what was typed.
      const file = JSON.parse(data.read(result.searchFile)!) as {
        tree: { term: string; query?: string }[];
      };
      expect(file.tree).toEqual([
        expect.objectContaining({ term: '黑白配', query: '抖音直播 PK 黑白配' }),
      ]);
      expect(result.ownReads).toHaveLength(1);
      // Not settled by the web alone, it's judged on what the search read.
      expect(result.carried).toEqual({
        status: 'resolved',
        answer: '四人 PK 分黑白两队。',
        source: 'douyin',
      });
    });

    it('stays settled by the web, without asking about Douyin, and still searches', async () => {
      const { learner, searched, prompts } = build(
        { '抖音直播 巅峰赛': { hot: [tagged('q1')] } },
        { query: { query: '抖音直播 巅峰赛' } },
        { depth: 0, web: { ...web, supports: 'full', answer: '巅峰赛是 PK 的排位赛。' } },
      );
      const result = await learner.learn('巅峰赛', {
        folder: 'topics',
        carry: { question: '「巅峰赛」是什么？' },
      });
      expect(searched).toEqual(['抖音直播 巅峰赛']);
      expect(prompts.some((p) => p.kind === 'douyin')).toBe(false);
      expect(result.carried).toEqual({
        status: 'resolved',
        answer: '巅峰赛是 PK 的排位赛。',
        source: 'web',
      });
    });

    it('searches the topic on its own when the aimed query finds nothing', async () => {
      const { learner, data, searched, logs } = build(
        { '抖音直播 PK 黑白配': new EmptyReadError('作品', []), 黑白配: { hot: [tagged('q1')] } },
        { query: { query: '抖音直播 PK 黑白配' } },
        { depth: 0, web },
      );
      const result = await learner.learn('黑白配', {
        folder: 'topics',
        carry: { question: '「黑白配」是什么？' },
      });
      expect(searched).toEqual(['抖音直播 PK 黑白配', '黑白配']);
      expect(logs).toContain(
        'search query found nothing {term: 黑白配, query: 抖音直播 PK 黑白配}',
      );
      const file = JSON.parse(data.read(result.searchFile)!) as { tree: { query?: string }[] };
      expect(file.tree[0]!.query).toBeUndefined();
      expect(result.ownReads).toHaveLength(1);
    });

    it('keeps only a query that has the topic in it and is short', () => {
      expect(parseSearchQuery('{"query": " 抖音直播  PK 黑白配 "}', '黑白配')).toBe(
        '抖音直播 PK 黑白配',
      );
      expect(parseSearchQuery('{"query": "四人连线分组"}', '黑白配')).toBe('黑白配');
      expect(parseSearchQuery(`{"query": "黑白配${'很'.repeat(30)}"}`, '黑白配')).toBe('黑白配');
      expect(parseSearchQuery('不是 JSON', '黑白配')).toBe('黑白配');
    });
  });
});
