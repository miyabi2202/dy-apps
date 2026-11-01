import { formatDraft, parseDraftAnswer, type DraftEvidence } from '../src/core/drafts';

const evidence: DraftEvidence = {
  refs: new Set(['a', 'b', 'c', 'a#1', 'a#1.1', 'b#2']),
  resolved: new Map([['u1', { urls: ['https://example.invalid/u1'] }]]),
  unresolved: ['神秘词'],
};

const parse = (...entries: object[]) =>
  parseDraftAnswer(JSON.stringify({ entries }), [], evidence).drafts;

describe('parseDraftAnswer with evidence', () => {
  it('lets a 事实 or 规则 rest on a post or a settled unknown, never on comments alone', () => {
    const drafts = parse(
      { title: '从作品', type: '事实', body: '正文', sources: ['a', 'zz', 'a#1'] },
      { title: '从查证', type: '规则', body: '正文', resolved: ['u1', 'u9'] },
      { title: '只有评论', type: '事实', body: '正文', sources: ['a#1'] },
    );
    expect(drafts.map((d) => [d.title, d.sources, d.urls])).toEqual([
      ['从作品', ['a'], []],
      ['从查证', [], ['https://example.invalid/u1']],
    ]);
  });

  it('wants a settled unknown or two posts for a fact about a person', () => {
    const drafts = parse(
      { title: '某人一', type: '事实', aboutPerson: true, body: '正文', sources: ['a'] },
      { title: '某人二', type: '事实', aboutPerson: true, body: '正文', sources: ['a', 'b'] },
      { title: '某人三', type: '事实', aboutPerson: true, body: '正文', resolved: ['u1'] },
    );
    expect(drafts.map((d) => d.title)).toEqual(['某人二', '某人三']);
  });

  it('makes a 梗 only from usages in two different posts, its 出处 only from a post or a reply', () => {
    const meme = (usages: string[], originRefs: string[]) => ({
      title: '某梗',
      type: '梗',
      meme: {
        meaning: '表示惊讶',
        origin: '一个直播切片',
        originRefs,
        examples: ['这也太某梗了'],
        form: '谐音',
      },
      usages,
    });
    expect(parse(meme(['a#1', 'a'], ['a#1.1']))).toEqual([]);
    const [withOrigin] = parse(meme(['a#1', 'b#2'], ['a#1.1']));
    expect(withOrigin!.body).toBe(
      [
        '含义：表示惊讶',
        '出处：一个直播切片（见 a#1.1）',
        '例句：「这也太某梗了」',
        '类型：谐音',
      ].join('\n'),
    );
    expect(withOrigin!.sources).toEqual(['a', 'b']);
    // A comment (not a reply) is no evidence of where it came from: the model's memory never is.
    const [noOrigin] = parse(meme(['a#1', 'b#2'], ['a#1']));
    expect(noOrigin!.body).toContain('出处：不确定（抖音上没找到作品或回复为证，不写）');
  });

  it('writes nothing about an unknown left unsettled, and no 社区观点 (code writes those)', () => {
    const drafts = parse(
      { title: '神秘词', type: '惯例', body: '正文' },
      { title: '别名的', aliases: ['神秘词'], type: '惯例', body: '正文' },
      { title: '看法', type: '社区观点', body: '正文' },
      { title: '无类型', body: '正文' },
    );
    expect(drafts.map((d) => [d.title, d.type])).toEqual([['无类型', '惯例']]);
  });
});

describe('formatDraft', () => {
  const draft = {
    kind: 'new' as const,
    title: '甲',
    aliases: [],
    type: '梗',
    asOf: '',
    body: '含义：x',
    change: '',
    from: '甲',
    sources: ['a'],
    urls: ['https://example.invalid/1'],
  };

  it('checks again by its type, and keeps the pages it rests on', () => {
    const text = formatDraft(draft, { today: '2026-11-01', path: '抖音搜索「甲」' });
    expect(text).toContain('复查: 2026-12-01');
    expect(text).toContain(
      '来源: 抖音搜索「甲」；视频 a；网页 https://example.invalid/1（2026-11-01 学到）',
    );
    expect(formatDraft({ ...draft, type: '惯例' }, { today: '2026-11-01', path: 'p' })).toContain(
      '复查: 2026-12-31',
    );
  });
});
