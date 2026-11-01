import { DraftStore } from '../src/app/draft-store';
import { TopicLearner } from '../src/app/topic-learner';
import type { SearchPort, SearchResult } from '../src/app/topic-search';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 1, 12).getTime();

/** A search that answers from a table of what each term finds, and logs what was searched. */
function fakeSearch(table: Record<string, Partial<SearchResult>>) {
  const searched: string[] = [];
  const search: SearchPort = {
    search: (topic) => {
      searched.push(topic);
      const found = table[topic] ?? {};
      return Promise.resolve({ topic, hot: [], newest: [], related: [], comments: {}, ...found });
    },
  };
  return { search, searched };
}

/** A Claude that answers the keyword question and the draft question from scripts. */
function fakeAsk(options: { keywords?: unknown; drafts?: unknown } = {}) {
  const prompts: { kind: 'keywords' | 'drafts'; text: string }[] = [];
  const ask = (prompt: string) => {
    const kind = prompt.includes('从候选里挑') ? 'keywords' : 'drafts';
    prompts.push({ kind, text: prompt });
    const answer =
      kind === 'keywords'
        ? (options.keywords ?? [])
        : (options.drafts ?? { entries: [], stillRight: [] });
    return Promise.resolve(JSON.stringify(answer));
  };
  return { ask, prompts };
}

const tagged = (id: string, ...tags: string[]) =>
  item(id, NOW, { hashtags: tags, desc: `视频${id}` });

function build(
  table: Record<string, Partial<SearchResult>>,
  claude: Parameters<typeof fakeAsk>[0],
  options: { depth?: number; maxSearches?: number; knowledge?: string } = {},
) {
  const data = new MemoryStore();
  const { search, searched } = fakeSearch(table);
  const { ask, prompts } = fakeAsk(claude);
  const logs: string[] = [];
  const learner = new TopicLearner({
    search,
    ask,
    data,
    drafts: new DraftStore(data),
    index: new KnowledgeIndex(parseKnowledge(options.knowledge ?? '')),
    log: (m) => logs.push(m),
    now: () => NOW,
    depth: options.depth,
    maxSearches: options.maxSearches,
  });
  return { learner, data, searched, prompts, logs };
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
    expect(prompts.map((p) => p.kind)).toEqual(['drafts']);
    expect(result).toMatchObject({ searches: 1, found: 3, drafts: 1 });
    expect(data.read('knowledge/pending/topics/2026-11-01.md')).toBe(
      [
        '## 今汐',
        'aliases: 今夕',
        '类型: 事实',
        '截至: 2026-11',
        '复查: 2026-12-01',
        '来源: 抖音搜索「鸣潮」；视频 a、b（2026-11-01 学到）',
        '',
        '鸣潮的角色。',
        '',
      ].join('\n'),
    );
    expect(logs[0]).toBe('topic searched {topic: 鸣潮, hot: 2, newest: 1, keywords: 0}');
    expect(logs[1]).toContain('drafts written');
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
});
