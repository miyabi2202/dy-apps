import {
  migrateQuestions,
  MIGRATED_QUESTIONS_FILE,
  OLD_QUESTIONS_FILE,
  TO_LEARN_FILE,
  ToLearnList,
} from '../src/app/to-learn-list';
import { TodoRun, todoOutcome } from '../src/app/todo-run';
import type { Carry, LearnResult } from '../src/app/topic-learner';
import { RunStopped } from '../src/core/errors';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 2, 12).getTime();

const LIST = [
  '# 还要学的',
  '',
  '随手写的一句话。',
  '',
  '- [ ] 星守护 — 星守护有什么用？（手写 2026-11-01）',
  '  已经查到：按时长付费。',
  '  `pnpm browse --topic 星守护`',
  '- [x] 灯牌 — 灯牌怎么升级？（手写）→ 2026-11-01 学到，草稿 1 条',
  '- [ ] 宇宙之心 - 宇宙之心是什么礼物？',
  '- [ ] 大飞',
  '',
  '## 还没做的事',
  '',
  '- 审核的改进还没提交。',
  '',
].join('\n');

function result(over: Partial<LearnResult> = {}): LearnResult {
  return {
    searches: 1,
    found: 5,
    drafts: 0,
    stillRight: 0,
    file: null,
    reads: [],
    ownReads: [],
    unknowns: 0,
    unresolved: 0,
    searchFile: 'searches/2026-11-02/x.json',
    carried: null,
    ...over,
  };
}

function setup(answers: Record<string, LearnResult | Error> = {}) {
  const bot = new MemoryStore({ [TO_LEARN_FILE]: LIST });
  const calls: { topic: string; folder: string; carry?: Carry; existing: number }[] = [];
  const logs: string[] = [];
  const run = new TodoRun({
    list: new ToLearnList(bot),
    learner: {
      learn: (topic, { folder, carry, existing = [] }) => {
        calls.push({ topic, folder, carry, existing: existing.length });
        const answer = answers[topic] ?? result();
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
      },
    },
    existing: () => [],
    log: (m) => logs.push(m),
    now: () => NOW,
  });
  return { bot, run, calls, logs };
}

describe('TodoRun', () => {
  it('learns the first n open items with their questions, and ticks each with what came of it', async () => {
    const { bot, run, calls } = setup({
      星守护: result({
        drafts: 2,
        carried: { status: 'resolved', answer: '给主播开的，按月付费。', source: 'web' },
      }),
      宇宙之心: result({ searchFile: 'searches/2026-11-02/宇宙之心.json' }),
    });
    expect(await run.run({ count: 2, folder: 'douyin' })).toEqual(['星守护', '宇宙之心']);
    expect(calls).toEqual([
      {
        topic: '星守护',
        folder: 'douyin',
        carry: { question: '星守护有什么用？', why: '已经查到：按时长付费。' },
        existing: 0,
      },
      {
        topic: '宇宙之心',
        folder: 'douyin',
        carry: { question: '宇宙之心是什么礼物？', why: '' },
        existing: 0,
      },
    ]);
    const lines = bot.read(TO_LEARN_FILE)!.split('\n');
    expect(lines[4]).toBe(
      '- [x] 星守护 — 星守护有什么用？（手写 2026-11-01）→ 2026-11-02 学到（网上）：给主播开的，按月付费。；草稿 2 条',
    );
    expect(lines[8]).toBe(
      '- [x] 宇宙之心 - 宇宙之心是什么礼物？ → 2026-11-02 没查到，见 searches/2026-11-02/宇宙之心.json',
    );
    // Every other line as it was.
    const before = LIST.split('\n');
    expect(lines.filter((_, i) => i !== 4 && i !== 8)).toEqual(
      before.filter((_, i) => i !== 4 && i !== 8),
    );
    // The next run goes on to the next open one, asking a question for a bare term.
    await run.run({ count: 3, folder: 'douyin' });
    expect(calls.at(-1)).toMatchObject({ topic: '大飞', carry: { question: '「大飞」是什么？' } });
  });

  it('leaves an item open when the run stops in it', async () => {
    const { bot, run } = setup({ 星守护: new RunStopped('验证') });
    await expect(run.run({ count: 3, folder: 'topics' })).rejects.toThrow('验证');
    expect(bot.read(TO_LEARN_FILE)).toBe(LIST);
  });

  it('leaves an item open when its own search was skipped and nothing settled its question', async () => {
    const { bot, run, logs } = setup({
      星守护: result({ searches: 0, found: 0 }),
      宇宙之心: result({
        searches: 0,
        found: 0,
        carried: { status: 'resolved', answer: '一个大礼物', source: 'web' },
      }),
    });
    await run.run({ count: 2, folder: 'topics' });
    const text = bot.read(TO_LEARN_FILE)!;
    expect(text).toContain('- [ ] 星守护 — 星守护有什么用？（手写 2026-11-01）\n');
    expect(logs).toContain('todo left open {term: 星守护, why: its search did not run}');
    // Settled on the web before the search, it's learnt all the same.
    expect(text).toContain('- [x] 宇宙之心');
  });

  it('says so, learning nothing, when every item is done', async () => {
    const bot = new MemoryStore({ [TO_LEARN_FILE]: '- [x] 甲 — 甲？（x）→ 学到\n' });
    const logs: string[] = [];
    const learned: string[] = [];
    const done = await new TodoRun({
      list: new ToLearnList(bot),
      learner: { learn: (topic) => (learned.push(topic), Promise.resolve(result())) },
      existing: () => [],
      log: (m) => logs.push(m),
    }).run({ count: 3, folder: 'topics' });
    expect(done).toEqual([]);
    expect(learned).toEqual([]);
    expect(logs).toEqual(['待学清单里没有没打勾的：没有可学的。']);
  });
});

describe('todoOutcome', () => {
  it('says learnt with the drafts, or not found with where the search is', () => {
    expect(todoOutcome(result({ drafts: 3 }), '2026-11-02')).toBe('2026-11-02 学到，草稿 3 条');
    expect(todoOutcome(result(), '2026-11-02')).toBe(
      '2026-11-02 没查到，见 searches/2026-11-02/x.json',
    );
  });
});

describe('ToLearnList', () => {
  it('makes the file with a header the first time it adds', () => {
    const bot = new MemoryStore();
    const list = new ToLearnList(bot);
    expect(list.open()).toEqual([]);
    list.add([{ term: '甲', question: '甲是什么？', from: '刷抖音时好奇 2026-11-02' }]);
    const text = bot.read(TO_LEARN_FILE)!;
    expect(text.startsWith('# 还要学的\n')).toBe(true);
    expect(text).toContain('`pnpm browse --todo`');
    expect(text.endsWith('## 待学\n\n- [ ] 甲 — 甲是什么？（刷抖音时好奇 2026-11-02）\n')).toBe(
      true,
    );
  });
});

describe('migrateQuestions', () => {
  it('moves the pending questions onto the list once, and renames the old file', () => {
    const old = JSON.stringify({
      questions: [
        { question: '「甲」是什么？', term: '甲', status: 'pending', askedOn: '2026-10-31' },
        { question: '乙？', term: '乙', status: 'done', askedOn: '2026-10-30', outcome: '查实' },
        { question: '星守护？', term: '星守护', status: 'pending', askedOn: '2026-10-31' },
      ],
    });
    const data = new MemoryStore({ [OLD_QUESTIONS_FILE]: old });
    const bot = new MemoryStore({ [TO_LEARN_FILE]: LIST });
    const logs: string[] = [];
    expect(migrateQuestions(data, new ToLearnList(bot), (m) => logs.push(m))).toBe(1);
    expect(data.read(OLD_QUESTIONS_FILE)).toBeNull();
    expect(data.read(MIGRATED_QUESTIONS_FILE)).toBe(old);
    expect(bot.read(TO_LEARN_FILE)).toBe(
      `${LIST}\n## 待学\n\n- [ ] 甲 — 「甲」是什么？（刷抖音时好奇 2026-10-31）\n`,
    );
    expect(logs).toEqual(['questions migrated {pending: 2, added: 1, to: browse/to-learn.md}']);
    // Nothing left to move the second time.
    expect(migrateQuestions(data, new ToLearnList(bot), () => {})).toBe(0);
  });
});
