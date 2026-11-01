import { DraftStore } from '../src/app/draft-store';
import { TopicLearner } from '../src/app/topic-learner';
import type { SearchPort, SearchResult } from '../src/app/topic-search';
import { QuestionStore } from '../src/app/question-store';
import { BlockedError } from '../src/core/errors';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';
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

type PromptKind = 'keywords' | 'understand' | 'kb' | 'douyin' | 'drafts';

/** Which question a prompt is. */
function kindOf(prompt: string): PromptKind {
  if (prompt.includes('从候选里挑')) return 'keywords';
  if (prompt.includes('请读懂它们')) return 'understand';
  if (prompt.includes('我们知识库里可能相关的条目')) return 'kb';
  if (prompt.includes('我们为了这个问题在抖音上搜了')) return 'douyin';
  return 'drafts';
}

/**
 * A Claude that answers each question from scripts: the keywords, the drafts, what a search leaves
 * unknown (by the term searched), and the judgements of the knowledge base and of Douyin.
 */
function fakeAsk(
  options: {
    keywords?: unknown;
    drafts?: unknown;
    understand?: Record<string, unknown>;
    kb?: unknown;
    douyin?: unknown;
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
    questions?: boolean;
  } = {},
) {
  const data = options.data ?? new MemoryStore();
  const { search, searched } = fakeSearch(table);
  const { ask, prompts } = fakeAsk(claude);
  const { askWeb, asked } = fakeWeb(options.web);
  const logs: string[] = [];
  const questions = new QuestionStore(data);
  const learner = new TopicLearner({
    search,
    ask,
    askWeb,
    questions: options.questions ? questions : null,
    maxUnknowns: options.maxUnknowns,
    data,
    drafts: new DraftStore(data),
    index: new KnowledgeIndex(parseKnowledge(options.knowledge ?? '')),
    log: (m) => logs.push(m),
    now: () => NOW,
    depth: options.depth,
    maxSearches: options.maxSearches,
  });
  return { learner, data, searched, prompts, logs, webAsked: asked, questions };
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

  it('looks her pending questions up first, and marks them done with what came of them', async () => {
    const data = new MemoryStore({
      'questions.json': JSON.stringify({
        questions: [
          {
            question: '「问题词」是什么？',
            term: '问题词',
            status: 'pending',
            askedOn: '2026-10-31',
          },
        ],
      }),
    });
    const { learner, searched, webAsked, questions } = build(
      { ...table, 问题词: { hot: [tagged('q1')] }, 别的: { hot: [tagged('z')] } },
      { douyin: { supports: 'full', answer: '是一个词。', refs: ['q1'] } },
      { depth: 0, data, questions: true },
    );
    await learner.learn('鸣潮', { folder: 'topics' });
    expect(webAsked[0]).toContain('「问题词」是什么？');
    expect(searched).toEqual(['鸣潮', '问题词']);
    expect(questions.all()).toMatchObject([
      {
        term: '问题词',
        status: 'done',
        doneOn: '2026-11-01',
        outcome: '查实（douyin）：是一个词。',
      },
    ]);
    // Taken once a run.
    await learner.learn('别的', { folder: 'topics' });
    expect(searched).toEqual(['鸣潮', '问题词', '别的']);
  });
});
