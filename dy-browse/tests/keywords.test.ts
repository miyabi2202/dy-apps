import { keywordCandidates } from '../src/core/keywords';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';

const none = () => false;

describe('keywordCandidates', () => {
  it('counts a hashtag once per post, drops the topic, and ranks by posts', () => {
    const out = keywordCandidates({
      topic: '鸣潮',
      related: [],
      known: none,
      posts: [
        { hashtags: ['鸣潮', '今汐', '今汐'], texts: [] },
        { hashtags: ['今汐', '抽卡'], texts: [] },
        { hashtags: ['抽卡'], texts: [] },
      ],
    });
    expect(out).toEqual([
      { term: '今汐', source: 'hashtag', posts: 2 },
      { term: '抽卡', source: 'hashtag', posts: 2 },
    ]);
  });

  it('finds phrases that repeat across posts, once per post however often a post says it', () => {
    const out = keywordCandidates({
      topic: '游戏',
      related: [],
      known: none,
      minPosts: 3,
      posts: [
        { hashtags: [], texts: ['出货出货出货了', '又出货了'] },
        { hashtags: [], texts: ['今天出货了'] },
        { hashtags: [], texts: ['大保底出货'] },
        { hashtags: [], texts: ['别的'] },
      ],
    });
    expect(out.map((c) => [c.term, c.posts])).toEqual([['出货', 3]]);
  });

  it('keeps the longest phrase when a shorter one inside it is no more common', () => {
    const posts = ['限时返场活动', '限时返场活动', '限时返场活动'].map((t) => ({
      hashtags: [],
      texts: [t],
    }));
    const out = keywordCandidates({ topic: 'x', related: [], known: none, posts });
    expect(out.map((c) => c.term)).toEqual(['限时返场活动']);
  });

  it('adds the related searches, minus stop words, the topic and what the knowledge base has', () => {
    const index = new KnowledgeIndex(parseKnowledge('## 今汐\naliases: 今夕\n\n鸣潮的角色。'));
    const out = keywordCandidates({
      topic: '鸣潮',
      posts: [],
      related: ['鸣潮', '抖音', '鸣潮 卡池', '今汐', '今夕大人'],
      known: (t) => index.known(t),
    });
    expect(out.map((c) => [c.term, c.source])).toEqual([['鸣潮 卡池', 'related']]);
  });

  it('lets a hashtag outrank the same term found as a phrase', () => {
    const posts = Array.from({ length: 3 }, () => ({ hashtags: ['出货'], texts: ['出货'] }));
    const out = keywordCandidates({ topic: 'x', related: [], known: none, posts });
    expect(out).toEqual([{ term: '出货', source: 'hashtag', posts: 3 }]);
  });
});

describe('parseKnowledge', () => {
  const md = [
    '前言',
    '## 艾莲',
    'aliases: 艾莲乔，Ellen',
    '类型: 事实',
    '截至: 3.3',
    '复查: 2027-01-31',
    '来源: https://example.invalid (2026-10-31 学到)',
    '',
    '《绝区零》的角色。',
    '## 旧的',
    '废弃: 错了',
    '',
    '不要',
    '## 没正文',
  ].join('\n');

  it('reads the meta lines, leaves out retired and empty entries and keeps the folder', () => {
    expect(parseKnowledge(md, 'zzz')).toEqual([
      {
        folder: 'zzz',
        title: '艾莲',
        aliases: ['艾莲乔', 'Ellen'],
        type: '事实',
        asOf: '3.3',
        reviewOn: '2027-01-31',
        source: 'https://example.invalid (2026-10-31 学到)',
        text: '## 艾莲\n\n《绝区零》的角色。',
      },
    ]);
  });
});
