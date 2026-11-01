import { DraftReview, type DraftReviewOptions } from '../src/app/draft-review';
import { parseKnowledge } from '../src/core/knowledge';
import {
  decide,
  parseReview,
  readSection,
  reviewPrompt,
  withReviewedSource,
  type Review,
} from '../src/core/review';
import { MemoryStore } from './support/memory-store';

const NOW = new Date(2026, 10, 1, 12).getTime();
const PENDING = 'knowledge/pending/douyin/2026-11-01.md';

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
const NOTED = `${section('拼会员', '惯例', '几个人合买会员。')}\n\n> 审核意见（2026-10-31）：ask/low，不确定`;

const review = (over: Partial<Review> = {}): Review => ({
  verdict: 'accept',
  confidence: 'high',
  reason: '有用，查实了',
  aboutPerson: false,
  duplicateOf: null,
  file: 'gifts.md',
  checked: ['https://example.com/a'],
  ...over,
});

/** A reviewer that answers by the draft's heading; one that isn't listed fails. */
function reviewer(answers: Record<string, Review | string>) {
  const prompts: string[] = [];
  const ask = (prompt: string) => {
    prompts.push(prompt);
    const title = /<<<\n## (.+)/.exec(prompt)?.[1] ?? '';
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
    'knowledge/douyin/gifts.md':
      '## 小心心\n\naliases: 心心\n类型: 事实\n来源: 直播间记录\n小心心是免费礼物。\n',
    'knowledge/pending/still-right-2026-11-01.md': '# 仍然正确\n- douyin/PK\n',
  });
  const data = new MemoryStore();
  const logs: string[] = [];
  const { ask, prompts } = reviewer(answers);
  const run = new DraftReview({
    bot,
    data,
    ask,
    log: (m) => logs.push(m),
    now: () => NOW,
    ...extra,
  });
  return { run, bot, data, logs, prompts };
}

describe('decide (the policy, by code)', () => {
  const fact = readSection(ZHANGUAN);
  it('accepts only accept/high, not about a person, no duplicate, a file, and a page for a 事实', () => {
    expect(decide(review(), fact).outcome).toBe('accept');
  });

  it.each([
    ['low confidence', review({ confidence: 'low' })],
    ['about a person', review({ aboutPerson: true })],
    ['a duplicate', review({ duplicateOf: '小心心' })],
    ['no file', review({ file: '' })],
    ['a file name not lowercase-dashed', review({ file: 'Gifts New.md' })],
    ['a 事实 with no URL', review({ checked: [] })],
    ['the reviewer said ask', review({ verdict: 'ask' })],
    ['no answer', null],
  ])('turns accept into ask: %s', (_why, answer) => {
    expect(decide(answer, fact).outcome).toBe('ask');
  });

  it('a 事实 or 规则 may rest on a URL already in its 来源; a 惯例 needs none', () => {
    const withUrl = readSection(section('展馆', '规则', '……', '网页 https://example.com/b'));
    expect(decide(review({ checked: [] }), withUrl).outcome).toBe('accept');
    const custom = readSection(section('拼会员', '惯例', '……'));
    expect(decide(review({ checked: [] }), custom).outcome).toBe('accept');
  });

  it('rejects only with high confidence', () => {
    expect(decide(review({ verdict: 'reject' }), fact).outcome).toBe('reject');
    expect(decide(review({ verdict: 'reject', confidence: 'low' }), fact).outcome).toBe('ask');
  });
});

describe('parseReview', () => {
  it('reads the JSON, keeps only web pages in checked', () => {
    const text =
      '好的：\n```json\n{"verdict":"accept","confidence":"high","reason":"r","aboutPerson":false,"duplicateOf":null,"file":"a.md","checked":["https://x.cn/1","不是网址"]}\n```';
    expect(parseReview(text)).toEqual({
      verdict: 'accept',
      confidence: 'high',
      reason: 'r',
      aboutPerson: false,
      duplicateOf: null,
      file: 'a.md',
      checked: ['https://x.cn/1'],
    });
  });

  it('is null for a wrong verdict, a wrong confidence, or no JSON', () => {
    expect(parseReview('{"verdict":"maybe","confidence":"high"}')).toBeNull();
    expect(parseReview('{"verdict":"accept","confidence":"medium"}')).toBeNull();
    expect(parseReview('不知道')).toBeNull();
  });
});

describe('reviewPrompt', () => {
  it("quotes the draft as data, with the folder's purpose, files and related entries", () => {
    const prompt = reviewPrompt({
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
    expect(prompt).toContain(`<<<\n${ZHANGUAN}\n>>>`);
  });
});

describe('DraftReview.run', () => {
  it('drops 未确认 notes, leaves noted sections, and asks for a change without calling the reviewer', async () => {
    const { run, bot, prompts, logs } = setup([UNSETTLED, NOTED, CHANGE].join('\n\n'));
    const summary = await run.run(null);
    expect(prompts).toEqual([]);
    expect(summary).toEqual({ accepted: 0, rejected: 0, asked: 1, dropped: 1, skipped: 1 });
    const left = bot.read(PENDING)!;
    expect(left).not.toContain('未确认');
    expect(left).toContain(NOTED);
    expect(left).toContain('> 审核意见（2026-11-01）：ask/code，修改已有条目');
    expect(logs).toContain('reviewed {title: 引流, outcome: asked, reason: 修改已有条目}');
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

  it('gives the reviewer the related entries and the folder files, and accepted ones count for the next', async () => {
    const { run, prompts } = setup([ZHANGUAN, section('小心心礼物', '事实', '……')].join('\n\n'), {
      展馆: review(),
      小心心礼物: review({ verdict: 'reject', duplicateOf: '小心心' }),
    });
    await run.run(null);
    expect(prompts[0]).toContain('- gifts.md：小心心');
    expect(prompts[0]).toContain('抖音直播间聊天机器人要懂的');
    expect(prompts[1]).toContain('- gifts.md：小心心、展馆');
    expect(prompts[1]).toContain('小心心是免费礼物。');
  });

  it('removes a rejected one, keeps an asked one with the note, and rewrites the pending file', async () => {
    const { run, bot } = setup([SHOUHUANG, DAO].join('\n\n'), {
      狩谎: review({ verdict: 'reject', reason: '和抖音直播无关' }),
      '到！': review({ aboutPerson: true, reason: '像是真的' }),
    });
    const summary = await run.run(null);
    expect(summary).toMatchObject({ accepted: 0, rejected: 1, asked: 1 });
    expect(bot.read(PENDING)).toBe(
      `${DAO}\n\n> 审核意见（2026-11-01）：accept/high，像是真的（说到真实的人，要人来看）\n`,
    );
  });

  it('asks when the reviewer fails or answers what cannot be read', async () => {
    const { run, bot, logs } = setup([ZHANGUAN, DAO].join('\n\n'), { '到！': '我觉得可以' });
    const summary = await run.run(null);
    expect(summary).toMatchObject({ accepted: 0, asked: 2 });
    const left = bot.read(PENDING)!;
    expect(left).toContain('ask/low（审核调用失败：timed out）');
    expect(left).toContain('ask/low（审核没有给出能读的回答）');
    expect(logs.at(-1)).toBe(
      'review done {accepted: 0, rejected: 0, asked: 2, dropped: 0, skipped: 0}',
    );
  });

  it('reviews only the folder asked for, and never the still-right list', () => {
    const { run, bot } = setup(ZHANGUAN);
    bot.write('knowledge/pending/topics/2026-11-01.md', DAO);
    expect(run.pendingFiles(null)).toEqual([
      'knowledge/pending/douyin/2026-11-01.md',
      'knowledge/pending/topics/2026-11-01.md',
    ]);
    expect(run.pendingFiles('topics')).toEqual(['knowledge/pending/topics/2026-11-01.md']);
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
  it('takes the accepted sections back out and puts them in pending, with a note', async () => {
    const { run, bot, data, logs } = setup([ZHANGUAN, DAO].join('\n\n'), {
      展馆: review(),
      '到！': review({ file: 'memes.md', checked: [] }),
    });
    const before = bot.read('knowledge/douyin/gifts.md');
    await run.run(null);
    expect(run.undo('2026-11-01')).toEqual({ undone: 2, missing: 0 });
    expect(bot.read('knowledge/douyin/gifts.md')).toBe(before);
    expect(bot.read('knowledge/douyin/memes.md')).toBeNull();
    const back = bot.read('knowledge/pending/douyin/2026-11-01-undone.md')!;
    expect(back).toContain(`${ZHANGUAN}\n\n> 审核意见（2026-11-01）：undone，`);
    expect(back).toContain(DAO);
    expect(logs).toContain(
      'undone {title: 展馆, from: knowledge/douyin/gifts.md, to: knowledge/pending/douyin/2026-11-01-undone.md}',
    );
    expect(data.read('review/2026-11-01.md')).toContain('- 撤回 展馆');
    // Twice: nothing left to take back; the next review leaves them for a person.
    expect(run.undo('2026-11-01')).toEqual({ undone: 0, missing: 2 });
    const again = await run.run(null);
    expect(again).toMatchObject({ accepted: 0, skipped: 2 });
  });
});
