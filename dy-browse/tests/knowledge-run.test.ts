import { DraftStore } from '../src/app/draft-store';
import { KnowledgeRun, VISITS_FILE } from '../src/app/knowledge-run';
import type { KnowledgeFile } from '../src/app/ports';
import { parseKnowledge } from '../src/core/knowledge';
import { entriesDue } from '../src/core/knowledge-order';
import { MemoryStore } from './support/memory-store';

const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime();

const entry = (title: string, meta: string[] = [], aliases = '') =>
  [
    `## ${title}`,
    ...(aliases ? [`aliases: ${aliases}`] : []),
    ...meta,
    '',
    `${title}的说明。`,
  ].join('\n');

const files: KnowledgeFile[] = [
  {
    folder: 'douyin',
    file: 'douyin/memes.md',
    text: [
      entry('甲', ['截至: 2026-09', '复查: 2026-12-25']),
      entry('乙', ['截至: 2026-05', '复查: 2026-10-01']),
      entry('丙', ['截至: 2026-02']),
      entry('丁', ['截至: 2026-08'], '丁丁'),
      '## 戊\n废弃: 错的\n\n不要',
    ].join('\n\n'),
  },
  { folder: 'zzz', file: 'zzz/a.md', text: entry('艾莲', ['截至: 2026-10']) },
];

function setup(now = day(11, 1), foundBy: Record<string, number> = {}) {
  const data = new MemoryStore();
  const learned: string[] = [];
  const logs: string[] = [];
  const run = new KnowledgeRun({
    source: { files: () => files },
    data,
    drafts: new DraftStore(data),
    learner: {
      learn: (topic) => {
        learned.push(topic);
        return Promise.resolve({
          searches: 1,
          found: foundBy[topic] ?? 5,
          drafts: 0,
          stillRight: 0,
          file: null,
          reads: [],
          unknowns: 0,
          unresolved: 0,
        });
      },
    },
    log: (m) => logs.push(m),
    now: () => now,
  });
  return { run, data, learned, logs };
}

describe('entriesDue', () => {
  const entries = files.flatMap((f) => parseKnowledge(f.text, f.folder));

  it('puts the passed 复查 first, then never browsed by oldest 截至, then the least recently browsed', () => {
    const out = entriesDue(entries, { 'douyin/甲': day(10, 1) }, day(11, 1));
    expect(out.map((d) => [d.entry.title, d.why])).toEqual([
      ['乙', '复查已到'],
      ['丙', '没浏览过'],
      ['丁', '没浏览过'],
      ['艾莲', '没浏览过'],
      ['甲', '轮到了'],
    ]);
  });

  it('a 复查 passed but browsed since goes back into the rotation', () => {
    const out = entriesDue(entries, { 'douyin/乙': day(10, 20) }, day(11, 1));
    expect(out[0]!.entry.title).not.toBe('乙');
    expect(out.at(-1)).toMatchObject({ why: '轮到了' });
  });
});

describe('KnowledgeRun', () => {
  it('browses max-topics entries in order, leaves out 废弃 ones, and keeps the visits', async () => {
    const { run, data, learned, logs } = setup();
    expect(await run.run({ folder: null, maxTopics: 2 })).toEqual(['乙', '丙']);
    expect(learned).toEqual(['乙', '丙']);
    expect(logs).toEqual([
      'knowledge topic {heading: 乙, why: 复查已到}',
      'knowledge topic {heading: 丙, why: 没浏览过}',
    ]);
    expect(JSON.parse(data.read(VISITS_FILE)!)).toEqual({
      'douyin/乙': day(11, 1),
      'douyin/丙': day(11, 1),
    });
  });

  it('the next run goes on to others, a daily run covering the whole base in turn', async () => {
    const first = setup(day(11, 1));
    await first.run.run({ folder: null, maxTopics: 2 });
    const second = new KnowledgeRun({
      source: { files: () => files },
      data: first.data,
      drafts: new DraftStore(first.data),
      learner: {
        learn: (t) => (
          second.seen.push(t),
          Promise.resolve({
            searches: 1,
            found: 5,
            drafts: 0,
            stillRight: 0,
            file: null,
            reads: [],
            unknowns: 0,
            unresolved: 0,
          })
        ),
      },
      log: () => {},
      now: () => day(11, 2),
    }) as KnowledgeRun & { seen: string[] };
    second.seen = [];
    await second.run({ folder: null, maxTopics: 2 });
    expect(second.seen).toEqual(['丁', '甲']);
  });

  it('browses one folder only', async () => {
    const { run, learned } = setup();
    await run.run({ folder: 'zzz', maxTopics: 5 });
    expect(learned).toEqual(['艾莲']);
  });

  it('skips an entry that already has an unreviewed draft in pending/, but not for a still-right list', async () => {
    const { run, data, learned, logs } = setup();
    data.write('knowledge/pending/douyin/2026-10-30.md', entry('乙', ['类型: 事实']));
    data.write('knowledge/pending/still-right-2026-10-30.md', '# 仍然正确\n\n- douyin/丙\n');
    await run.run({ folder: null, maxTopics: 2 });
    expect(learned).toEqual(['丙', '丁']);
    expect(logs[0]).toBe('knowledge skipped {heading: 乙, why: 已有未审的草稿}');
  });

  it('also skips when the draft is under an alias of the entry', async () => {
    const { run, data, learned } = setup();
    data.write('knowledge/pending/douyin/x.md', entry('丁丁', ['类型: 事实']));
    await run.run({ folder: 'douyin', maxTopics: 5 });
    expect(learned).not.toContain('丁');
  });

  it('searches by the first alias when the heading finds little', async () => {
    const { run, learned } = setup(day(11, 1), { 丁: 1 });
    await run.run({ folder: 'douyin', maxTopics: 4 });
    expect(learned).toEqual(['乙', '丙', '丁', '丁丁', '甲']);
  });

  it('says so when the knowledge base is empty', async () => {
    const data = new MemoryStore();
    const logs: string[] = [];
    const run = new KnowledgeRun({
      source: { files: () => [] },
      data,
      drafts: new DraftStore(data),
      learner: { learn: () => Promise.reject(new Error('not called')) },
      log: (m) => logs.push(m),
    });
    expect(await run.run({ folder: null, maxTopics: 5 })).toEqual([]);
    expect(logs[0]).toContain('没有条目');
  });
});
