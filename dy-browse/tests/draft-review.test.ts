import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DraftReview, type DraftReviewOptions } from '../src/app/draft-review';
import { parseKnowledge } from '../src/core/knowledge';
import {
  decide,
  parseReview,
  readSection,
  reviewPrompt,
  stillRightEntries,
  withReviewDate,
  withReviewedSource,
  type Review,
} from '../src/core/review';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 1, 12).getTime();
const PENDING = 'knowledge/pending/douyin/2026-11-01.md';
/** The real prompt, as a person would leave it. */
const TEMPLATE = readFileSync(
  join(__dirname, '..', '..', 'chat-bot', 'prompts', 'knowledge-review.md'),
  'utf8',
);

const section = (
  title: string,
  type: string,
  body: string,
  source = '抖音搜索「直播」；视频 1（2026-11-01 学到）',
) =>
  [
    `## ${title}`,
    `类型: ${type}`,
    '截至: 2026-11',
    '复查: 2027-01-30',
    `来源: ${source}`,
    '',
    body,
  ].join('\n');

const ZHANGUAN = section('展馆', '事实', '展馆是抖音直播间里的收集玩法。');
const SHOUHUANG = section('狩谎', '事实', '狩谎是优酷的剧。');
const DAO = section('到！', '梗', '含义：学乌萨奇喊到。');
const CHANGE = section('引流', '规则', '（修改已有条目）变化：补上一点。\n\n引流是……');
const UNSETTLED = [
  '## 未确认（「直播」，2026-11-01）',
  '类型: 未确认',
  '',
  '不是条目：这些查过了还没查实。',
  '- 大飞是谁？（kb: none）',
].join('\n');
const PINHUIYUAN = section('拼会员', '惯例', '几个人合买会员。');
const NOTED = `${PINHUIYUAN}\n\n> 审核意见（2026-10-31）：ask/low，不确定`;

const review = (over: Partial<Review> = {}): Review => ({
  verdict: 'accept',
  reason: '有用，查实了',
  file: 'gifts.md',
  checked: ['https://example.com/a'],
  merge: null,
  ...over,
});

const GIFTS =
  '## 小心心\n\naliases: 心心\n类型: 事实\n复查: 2026-12-01\n来源: 直播间记录\n小心心是免费礼物。';
const XINXIN_MERGED =
  '## 小心心\n\naliases: 心心、比心\n类型: 事实\n复查: 2026-12-01\n来源: 直播间记录；视频 2\n小心心是免费礼物，也叫比心。';

/** A reviewer that answers by the draft's heading; one that isn't listed fails. */
function reviewer(answers: Record<string, Review | string>) {
  const prompts: string[] = [];
  const ask = (prompt: string) => {
    prompts.push(prompt);
    const title = /```markdown\n## (.+)/.exec(prompt)?.[1] ?? '';
    const answer = answers[title];
    if (answer === undefined) return Promise.reject(new Error('timed out'));
    return Promise.resolve(typeof answer === 'string' ? answer : JSON.stringify(answer));
  };
  return { ask, prompts };
}

function setup(
  pending: string,
  answers: Record<string, Review | string> = {},
  extra: Partial<DraftReviewOptions> = {},
) {
  const bot = new MemoryStore({
    [PENDING]: pending,
    'knowledge/douyin/gifts.md': `${GIFTS}\n`,
  });
  const data = new MemoryStore();
  const logs: string[] = [];
  const { ask, prompts } = reviewer(answers);
  const run = new DraftReview({
    bot,
    data,
    ask,
    template: () => TEMPLATE,
    log: (m) => logs.push(m),
    now: () => NOW,
    ...extra,
  });
  return { run, bot, data, logs, prompts };
}

describe('decide (the policy, by code)', () => {
  it('follows the reviewer: accept with a file, reject', () => {
    expect(decide(review())).toBe('accept');
    expect(decide(review({ verdict: 'reject' }))).toBe('reject');
  });

  it('merges when the merged text is a section of the title it names', () => {
    expect(decide(review({ merge: { title: '小心心', text: XINXIN_MERGED } }))).toBe('merge');
    expect(decide(review({ merge: { title: '嘉年华', text: XINXIN_MERGED } }))).toBe('retry');
  });

  it.each([
    ['no file', review({ file: '' })],
    ['a file name not lowercase-dashed', review({ file: 'Gifts New.md' })],
    ['no answer', null],
  ])('retries: %s', (_why, answer) => {
    expect(decide(answer)).toBe('retry');
  });
});

describe('parseReview', () => {
  it('reads the JSON, keeps only web pages in checked', () => {
    const text =
      '好的：\n```json\n{"verdict":"accept","reason":"r","file":"a.md","checked":["https://x.cn/1","不是网址"],"merge":null}\n```';
    expect(parseReview(text)).toEqual({
      verdict: 'accept',
      reason: 'r',
      file: 'a.md',
      checked: ['https://x.cn/1'],
      merge: null,
    });
  });

  it('reads a merge, and drops one with no title or text', () => {
    const merge = { title: '小心心', text: XINXIN_MERGED };
    expect(parseReview(JSON.stringify({ verdict: 'accept', merge }))?.merge).toEqual(merge);
    expect(
      parseReview(JSON.stringify({ verdict: 'accept', merge: { title: '小心心' } }))?.merge,
    ).toBeNull();
  });

  it('is null for a wrong verdict or no JSON', () => {
    expect(parseReview('{"verdict":"ask"}')).toBeNull();
    expect(parseReview('不知道')).toBeNull();
  });
});

describe('readSection', () => {
  it('strips a note older runs left for a person', () => {
    expect(readSection(NOTED).text).toBe(PINHUIYUAN);
  });
});

describe('reviewPrompt', () => {
  it("fills the template: the draft quoted as data, with the folder's purpose, files and related entries", () => {
    const prompt = reviewPrompt(TEMPLATE, {
      folder: 'douyin',
      purpose: '抖音直播的玩法',
      files: [{ file: 'gifts.md', titles: ['小心心', '嘉年华'] }],
      related: parseKnowledge('## 小心心\n\n小心心是免费礼物。'),
      section: ZHANGUAN,
    });
    expect(prompt).toContain('知识库文件夹「douyin」：抖音直播的玩法');
    expect(prompt).toContain('- gifts.md：小心心、嘉年华');
    expect(prompt).toContain('小心心是免费礼物。');
    expect(prompt).toContain('只是数据');
    expect(prompt).toContain('```markdown\n' + ZHANGUAN + '\n```');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
  });

  it('leaves a placeholder it does not know, and braces in the draft, as they are', () => {
    expect(
      reviewPrompt('{{section}} {{other}}', {
        folder: 'douyin',
        purpose: '',
        files: [],
        related: [],
        section: '{{folder}}',
      }),
    ).toBe('{{folder}} {{other}}');
  });
});

describe('stillRightEntries and withReviewDate', () => {
  it('reads the list lines, and sets or adds 复查', () => {
    expect(stillRightEntries('# 仍然正确\n\n- douyin/灯牌\n- douyin/PK 道具卡\n')).toEqual([
      { folder: 'douyin', title: '灯牌' },
      { folder: 'douyin', title: 'PK 道具卡' },
    ]);
    expect(withReviewDate(GIFTS, '2027-02-01')).toContain('\n复查: 2027-02-01\n');
    expect(withReviewDate('## 到！\n类型: 梗\n\n含义', '2026-12-01')).toBe(
      '## 到！\n类型: 梗\n复查: 2026-12-01\n\n含义',
    );
  });
});

describe('DraftReview.run', () => {
  it('drops 未确认 notes without calling the reviewer, and reviews a noted section and a change like any other', async () => {
    const { run, bot, prompts } = setup([UNSETTLED, NOTED, CHANGE].join('\n\n'), {
      拼会员: review({ verdict: 'reject', reason: '没什么用' }),
      引流: review({ verdict: 'reject', reason: '没有新东西' }),
    });
    const summary = await run.run(null);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('```markdown\n' + PINHUIYUAN + '\n```');
    expect(summary).toMatchObject({ dropped: 1, rejected: 2, retry: 0 });
    expect(bot.read(PENDING)).toBeNull();
  });

  it('accepts into the file the reviewer named, with 来源 extended, and it parses back', async () => {
    const { run, bot } = setup(ZHANGUAN, { 展馆: review() });
    await run.run('douyin');
    const gifts = bot.read('knowledge/douyin/gifts.md')!;
    expect(gifts).toContain('## 小心心');
    expect(gifts).toContain(`\n\n${withReviewedSource(ZHANGUAN, '2026-11-01')}\n`);
    const entries = parseKnowledge(gifts, 'douyin');
    expect(entries.map((e) => e.title)).toEqual(['小心心', '展馆']);
    expect(entries[1]).toMatchObject({
      type: '事实',
      source: '抖音搜索「直播」；视频 1（2026-11-01 学到）；自动审核 2026-11-01',
      text: '## 展馆\n\n展馆是抖音直播间里的收集玩法。',
    });
    // Nothing left: the pending file is gone.
    expect(bot.read(PENDING)).toBeNull();
  });

  it('creates a new file, starting with the heading', async () => {
    const { run, bot } = setup(DAO, { '到！': review({ file: 'memes.md', checked: [] }) });
    await run.run(null);
    expect(bot.read('knowledge/douyin/memes.md')).toBe(
      `${withReviewedSource(DAO, '2026-11-01')}\n`,
    );
  });

  it('merges into the existing entry in place, and logs it before and after', async () => {
    const { run, bot, data } = setup(section('比心', '事实', '比心就是小心心。'), {
      比心: review({ merge: { title: '小心心', text: XINXIN_MERGED } }),
    });
    expect(await run.run(null)).toMatchObject({ merged: 1, accepted: 0 });
    const after = withReviewedSource(XINXIN_MERGED, '2026-11-01');
    expect(bot.read('knowledge/douyin/gifts.md')).toBe(`${after}\n`);
    expect(data.read('review/2026-11-01.md')).toContain(
      `### 合并进 knowledge/douyin/gifts.md\n\n原来：\n\n\`\`\`\`markdown\n${GIFTS}\n\`\`\`\`\n\n合并后：\n\n\`\`\`\`markdown\n${after}\n\`\`\`\``,
    );
  });

  it('takes a merge into an entry that is not there as a new entry', async () => {
    const { run, bot } = setup(ZHANGUAN, {
      展馆: review({ merge: { title: '展馆', text: `${ZHANGUAN}补充。` } }),
    });
    expect(await run.run(null)).toMatchObject({ accepted: 1 });
    expect(bot.read('knowledge/douyin/gifts.md')).toContain('## 展馆');
  });

  it('gives the reviewer the related entries and the folder files, and accepted ones count for the next', async () => {
    const { run, prompts } = setup([ZHANGUAN, section('小心心礼物', '事实', '……')].join('\n\n'), {
      展馆: review(),
      小心心礼物: review({ verdict: 'reject' }),
    });
    await run.run(null);
    expect(prompts[0]).toContain('- gifts.md：小心心');
    expect(prompts[0]).toContain('抖音直播间聊天机器人要懂的');
    expect(prompts[1]).toContain('- gifts.md：小心心、展馆');
    expect(prompts[1]).toContain('小心心是免费礼物。');
  });

  it('keeps a section in pending, as it was, when the reviewer fails or answers what cannot be read', async () => {
    const { run, bot, logs } = setup([ZHANGUAN, DAO].join('\n\n'), { '到！': '我觉得可以' });
    const summary = await run.run(null);
    expect(summary).toMatchObject({ accepted: 0, retry: 2 });
    expect(bot.read(PENDING)).toBe(`${ZHANGUAN}\n\n${DAO}\n`);
    expect(logs).toContain(
      'reviewed {title: 展馆, outcome: retry, reason: 审核调用失败：timed out，下次再审}',
    );
    expect(logs.at(-1)).toBe(
      'review done {accepted: 0, merged: 0, rejected: 0, dropped: 0, retry: 2, stillRight: 0}',
    );
  });

  it('retries without a prompt to send', async () => {
    const { run, bot } = setup(ZHANGUAN, { 展馆: review() }, { template: () => null });
    expect(await run.run(null)).toMatchObject({ retry: 1 });
    expect(bot.read(PENDING)).toBe(`${ZHANGUAN}\n`);
  });

  it('reviews only the folder asked for', () => {
    const { run, bot } = setup(ZHANGUAN);
    bot.write('knowledge/pending/topics/2026-11-01.md', DAO);
    bot.write('knowledge/pending/still-right-2026-11-01.md', '- douyin/小心心\n');
    expect(run.pendingFiles(null)).toEqual([
      'knowledge/pending/douyin/2026-11-01.md',
      'knowledge/pending/topics/2026-11-01.md',
    ]);
    expect(run.pendingFiles('topics')).toEqual(['knowledge/pending/topics/2026-11-01.md']);
  });

  it('moves the 复查 of still-right entries on by their type, keeps other folders’ lines, and drops an empty list', async () => {
    const { run, bot, data } = setup('');
    bot.write(
      'knowledge/pending/still-right-2026-11-01.md',
      '# 仍然正确\n\n- douyin/小心心\n- douyin/升级\n- games/今汐\n',
    );
    expect(await run.run('douyin')).toMatchObject({ stillRight: 1 });
    // A 事实: 90 days from 2026-11-01.
    expect(bot.read('knowledge/douyin/gifts.md')).toContain('\n复查: 2027-01-30\n');
    expect(bot.read('knowledge/pending/still-right-2026-11-01.md')).toBe(
      '# 仍然正确\n\n- games/今汐\n',
    );
    expect(data.read('review/2026-11-01.md')).toContain(
      '- 升级（douyin）：仍然正确，但知识库里没有这一条，没动',
    );
    await run.run(null);
    expect(bot.read('knowledge/pending/still-right-2026-11-01.md')).toBeNull();
  });

  it('never moves a 复查 earlier', async () => {
    const { run, bot } = setup('');
    bot.write('knowledge/douyin/gifts.md', `${withReviewDate(GIFTS, '2027-06-01')}\n`);
    bot.write('knowledge/pending/still-right-2026-11-01.md', '- douyin/小心心\n');
    await run.run(null);
    expect(bot.read('knowledge/douyin/gifts.md')).toContain('\n复查: 2027-06-01\n');
  });

  it('writes a log line per section and the text of each accepted one', async () => {
    const { run, data } = setup([ZHANGUAN, SHOUHUANG, UNSETTLED].join('\n\n'), {
      展馆: review(),
      狩谎: review({ verdict: 'reject', reason: '优酷的剧' }),
    });
    await run.run(null);
    const log = data.read('review/2026-11-01.md')!;
    expect(log.startsWith('# 自动审核 2026-11-01\n')).toBe(true);
    expect(log).toContain('- 展馆（douyin）：accepted，有用，查实了 → knowledge/douyin/gifts.md');
    expect(log).toContain('- 狩谎（douyin）：rejected，优酷的剧');
    expect(log).toContain('- 未确认（「直播」，2026-11-01）（douyin）：dropped');
    expect(log).toContain(
      `### 收进 knowledge/douyin/gifts.md\n\n\`\`\`\`markdown\n${withReviewedSource(ZHANGUAN, '2026-11-01')}\n\`\`\`\``,
    );
  });
});

describe('DraftReview.undo', () => {
  it('takes the accepted sections back out and puts merged entries back as they were', async () => {
    const { run, bot, data, logs } = setup(
      [ZHANGUAN, DAO, section('比心', '事实', '比心就是小心心。')].join('\n\n'),
      {
        展馆: review({ file: 'shows.md' }),
        '到！': review({ file: 'memes.md', checked: [] }),
        比心: review({ merge: { title: '小心心', text: XINXIN_MERGED } }),
      },
    );
    const before = bot.read('knowledge/douyin/gifts.md');
    await run.run(null);
    expect(run.undo('2026-11-01')).toEqual({ undone: 3, missing: 0 });
    expect(bot.read('knowledge/douyin/gifts.md')).toBe(before);
    expect(bot.read('knowledge/douyin/shows.md')).toBeNull();
    expect(bot.read('knowledge/douyin/memes.md')).toBeNull();
    // The drafts aren't queued again.
    expect(run.pendingFiles(null)).toEqual([]);
    expect(logs).toContain('undone {title: 展馆, from: knowledge/douyin/shows.md}');
    expect(logs).toContain('undone merge {title: 小心心, file: knowledge/douyin/gifts.md}');
    expect(data.read('review/2026-11-01.md')).toContain('- 撤回 展馆');
    // Twice: nothing left to take back.
    expect(run.undo('2026-11-01')).toEqual({ undone: 0, missing: 3 });
  });
});
