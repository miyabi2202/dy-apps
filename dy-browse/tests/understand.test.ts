import { asksSomething, numberedComments, repliesToOpen } from '../src/core/comments';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';
import { countSide, view } from '../src/core/opinions';
import { itemText, itemsWithin } from '../src/core/prompts';
import { parseResolution } from '../src/core/resolve';
import { parseUnderstanding, refsOf, searchable } from '../src/core/understand';
import type { Comment, ReadItem } from '../src/core/types';
import { item } from './support/fakes';

const c = (text: string, likes: number, extra: Partial<Comment> = {}): Comment => ({
  text,
  likes,
  postedAt: null,
  ...extra,
});

const read = (id: string, comments: Comment[], who = id): ReadItem => ({
  item: item(id, null, {
    author: { nickname: who, secUid: who },
    stats: { likes: 50, comments: 0, shares: 0 },
  }),
  comments,
  material: null,
});

describe('comments', () => {
  it('knows a comment that asks', () => {
    expect(asksSomething('这是什么梗啊')).toBe(true);
    expect(asksSomething('求出处')).toBe(true);
    expect(asksSomething('好看')).toBe(false);
  });

  it('opens the asking ones first, then the most liked, never one with no replies, at most three', () => {
    const list = [c('a', 1), c('啥意思', 0), c('b', 9), c('c', 5, { replyCount: 0 }), c('d', 3)];
    expect(repliesToOpen(list)).toEqual([1, 2, 4]);
  });

  it('numbers comments by likes and the replies under them, the same for prompts and refs', () => {
    const r = read('p', [c('少', 1), c('多', 9, { replies: [c('回1', 0), c('回2', 4)] })]);
    expect(numberedComments(r).map((n) => [n.ref, n.comment.text])).toEqual([
      ['p#1', '多'],
      ['p#1.1', '回2'],
      ['p#1.2', '回1'],
      ['p#2', '少'],
    ]);
    expect([...refsOf([r])]).toEqual(['p', 'p#1', 'p#1.1', 'p#1.2', 'p#2']);
  });

  it('shows every comment by likes, clipped, replies indented, askers marked', () => {
    const long = '长'.repeat(200);
    const text = itemText(
      read('p', [c('一般', 1), c(long, 9, { asks: true, replies: [c('答案在这', 2)] })]),
    );
    expect(text).toContain(`- [p#1] 〔提问〕${'长'.repeat(150)}…（赞9）`);
    expect(text).toContain('    ↳ [p#1.1] 答案在这（赞2）');
    expect(text.indexOf('[p#1]')).toBeLessThan(text.indexOf('[p#2]'));
  });

  it('keeps a search to what fits: the posts cap and the characters, the first always in', () => {
    const many = Array.from({ length: 20 }, (_, i) => read(`p${i}`, [c('x'.repeat(100), 1)]));
    expect(itemsWithin(many)).toHaveLength(12);
    expect(itemsWithin(many, 12, 10)).toHaveLength(1);
  });
});

describe('searchable', () => {
  it('drops a note in brackets and keeps the first of two spellings', () => {
    expect(searchable('仙贝 / 雪饼（直播间）')).toBe('仙贝');
    expect(searchable('博弈（恐怖游戏直播）')).toBe('博弈');
    expect(searchable('灯牌(粉丝团)')).toBe('灯牌');
    expect(searchable('先天乌萨奇圣体')).toBe('先天乌萨奇圣体');
  });

  it('keeps a term that is only a note as it was', () => {
    expect(searchable('（主播）')).toBe('（主播）');
  });
});

describe('parseUnderstanding', () => {
  const known = new Set(['a', 'a#1', 'b', 'b#1.1']);

  it('keeps standalone unknowns with a known kind, its own refs only, at most the cap', () => {
    const answer = JSON.stringify({
      unknowns: [
        {
          question: '抖音上「yyds」是什么意思？',
          term: 'yyds',
          kind: '词',
          why: '缩写',
          refs: ['a#1', 'zzz'],
        },
        { question: '这是谁？', term: '某人', kind: '明星', refs: ['b'] },
        { question: '没词', term: '' },
        { question: '「yyds」又一次', term: 'yyds', kind: '词' },
        ...['一', '二', '三', '四'].map((t) => ({ question: `「${t}」？`, term: t, kind: '梗' })),
      ],
    });
    const { unknowns } = parseUnderstanding(answer, known);
    expect(unknowns).toHaveLength(5);
    expect(unknowns[0]).toEqual({
      question: '抖音上「yyds」是什么意思？',
      term: 'yyds',
      kind: '词',
      why: '缩写',
      refs: ['a#1'],
    });
    // A question with a pronoun gets its term; a kind not on the list is 其他.
    expect(unknowns[1]).toMatchObject({ question: '这是谁？（指「某人」）', kind: '其他' });
  });

  it('keeps opinions and claims that cite something read', () => {
    const answer = JSON.stringify({
      opinions: [
        { point: '太难', counter: '还行', refs: ['a#1'], counterRefs: ['b#1.1', 'x'] },
        { point: '没有出处', refs: ['nope'] },
      ],
      claims: [
        { claim: '3.0 下周上线', refs: ['b'] },
        { claim: '', refs: ['a'] },
      ],
    });
    const { opinions, claims } = parseUnderstanding(`说明：\n${answer}`, known);
    expect(opinions).toEqual([
      { point: '太难', counter: '还行', refs: ['a#1'], counterRefs: ['b#1.1'] },
    ]);
    expect(claims).toEqual([{ claim: '3.0 下周上线', refs: ['b'] }]);
    expect(parseUnderstanding('不是 JSON', known)).toEqual({
      unknowns: [],
      opinions: [],
      claims: [],
    });
  });
});

describe('view', () => {
  it('drops a lead-in the model wrote itself, and the full stop, so 「有人觉得」 reads once', () => {
    expect(view('也有观众说，给主播开了星守护以后反被拉黑。')).toBe('给主播开了星守护以后反被拉黑');
    expect(view('也有人觉得也有人觉得并不算贵')).toBe('并不算贵');
    expect(view('大家觉得这几版翻唱很好听。')).toBe('这几版翻唱很好听');
    expect(view('也有人认为沉溺回忆会伤害自己。')).toBe('沉溺回忆会伤害自己');
  });

  it('leaves an opinion with no lead-in as it is', () => {
    expect(view('人设崩了')).toBe('人设崩了');
    expect(view('星守护挺贵')).toBe('星守护挺贵');
  });
});

describe('countSide', () => {
  it('counts distinct posts, distinct creators and each ref’s likes once', () => {
    const reads = [
      read('a', [c('x', 10)], '甲'),
      read('b', [c('y', 4, { replies: [c('z', 6)] })], '乙'),
      read('c', [c('w', 1)], '甲'),
    ];
    expect(countSide(['a#1', 'a#1', 'b#1.1', 'c#1'], reads)).toEqual({
      posts: 3,
      creators: 2,
      likes: 17,
      postIds: ['a', 'b', 'c'],
    });
    // A post id counts the post's own likes.
    expect(countSide(['a'], reads).likes).toBe(50);
  });
});

describe('parseResolution', () => {
  it('reads supports and the answer; no answer is none', () => {
    expect(parseResolution('{"supports":"full","answer":"是个词"}', 'kb', { kind: '词' })).toEqual({
      source: 'kb',
      supports: 'full',
      answer: '是个词',
    });
    expect(parseResolution('{"supports":"full","answer":""}', 'kb', { kind: '词' }).supports).toBe(
      'none',
    );
    expect(
      parseResolution('{"supports":"maybe","answer":"x"}', 'kb', { kind: '词' }).supports,
    ).toBe('none');
  });

  it('from the web: full needs a URL, and a 梗 is at most partial', () => {
    const web = (answer: object, kind = '词') =>
      parseResolution(JSON.stringify(answer), 'web', { kind: kind as '词' });
    expect(
      web({ supports: 'full', answer: 'x', urls: ['https://a.invalid', 'ftp://b', 1] }),
    ).toEqual({
      source: 'web',
      supports: 'full',
      answer: 'x',
      urls: ['https://a.invalid'],
    });
    expect(web({ supports: 'full', answer: 'x', urls: [] }).supports).toBe('partial');
    expect(web({ supports: 'full', answer: 'x', urls: ['https://a.invalid'] }, '梗').supports).toBe(
      'partial',
    );
  });

  it('from Douyin: only refs read count, and a 梗 needs a post or a reply among them', () => {
    const known = new Set(['p', 'p#1', 'p#1.1']);
    const douyin = (refs: string[], kind = '词') =>
      parseResolution(
        JSON.stringify({ supports: 'full', answer: 'x', refs }),
        'douyin',
        { kind: kind as '词' },
        known,
      );
    expect(douyin(['p#1', 'zz'])).toMatchObject({ supports: 'full', refs: ['p#1'] });
    expect(douyin(['zz']).supports).toBe('partial');
    expect(douyin(['p#1'], '梗').supports).toBe('partial');
    expect(douyin(['p#1.1'], '梗').supports).toBe('full');
    expect(douyin(['p'], '梗').supports).toBe('full');
  });
});

describe('KnowledgeIndex.lookup', () => {
  const index = new KnowledgeIndex(
    parseKnowledge(
      [
        '## 鸣潮\naliases: 鸣潮手游\n\n一个游戏。',
        '## 今汐\n\n鸣潮的角色。',
        '## 别的\n\n无关。',
      ].join('\n\n'),
    ),
  );

  it('finds entries named by the term first, then those whose body says it', () => {
    expect(index.lookup('鸣潮').map((e) => e.title)).toEqual(['鸣潮', '今汐']);
    expect(index.lookup('鸣潮', 1).map((e) => e.title)).toEqual(['鸣潮']);
    expect(index.lookup('x')).toEqual([]);
  });
});
