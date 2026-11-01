import { UnknownResolver } from '../src/app/unknown-resolver';
import { KnowledgeIndex, parseKnowledge } from '../src/core/knowledge';
import type { Unknown } from '../src/core/understand';
import { item } from './support/fakes';

const unknown = (term: string, kind: Unknown['kind'] = '词'): Unknown => ({
  question: `「${term}」是什么意思？`,
  term,
  kind,
  why: '',
  refs: [],
});

const NONE = { supports: 'none', answer: '' };

/** A resolver over a knowledge base, with Claude and the web answering from scripts. */
function setup({
  knowledge = '',
  kb = NONE,
  web = NONE,
  douyin = NONE,
  withWeb = true,
}: {
  knowledge?: string;
  kb?: object;
  web?: object | Error;
  douyin?: object;
  withWeb?: boolean;
} = {}) {
  const asked: string[] = [];
  const logs: string[] = [];
  const answer = (prompt: string) => {
    asked.push(prompt);
    return Promise.resolve(JSON.stringify(prompt.includes('知识库') ? kb : douyin));
  };
  const resolver = new UnknownResolver({
    ask: answer,
    askWeb: withWeb
      ? (prompt) => {
          asked.push(`web: ${prompt}`);
          return web instanceof Error ? Promise.reject(web) : Promise.resolve(JSON.stringify(web));
        }
      : null,
    index: new KnowledgeIndex(parseKnowledge(knowledge)),
    log: (m) => logs.push(m),
    today: () => '2026-11-01',
  });
  return { resolver, asked, logs };
}

describe('UnknownResolver', () => {
  it('asks nothing of the knowledge base when it has no entry about the term, then goes to the web', async () => {
    const { resolver, asked } = setup({
      web: { supports: 'full', answer: '夸人的话', urls: ['https://example.invalid/a'] },
    });
    expect(await resolver.offline(unknown('绝绝子'))).toEqual([
      { source: 'kb', supports: 'none', answer: '知识库里没有' },
      { source: 'web', supports: 'full', answer: '夸人的话', urls: ['https://example.invalid/a'] },
    ]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('web: 今天是 2026-11-01');
    expect(asked[0]).toContain('一条只算一票');
  });

  it('stops at the knowledge base when it settles it', async () => {
    const { resolver, asked } = setup({
      knowledge: '## 绝绝子\n\n夸人的话。',
      kb: { supports: 'full', answer: '夸人的话' },
    });
    const found = await resolver.offline(unknown('绝绝子'));
    expect(found.map((r) => [r.source, r.supports])).toEqual([['kb', 'full']]);
    expect(asked[0]).toContain('## 绝绝子');
    expect(asked.some((a) => a.startsWith('web'))).toBe(false);
  });

  it('records a failed web lookup as none, and skips the web when there is none', async () => {
    const failing = setup({ web: new Error('timed out') });
    const [, web] = await failing.resolver.offline(unknown('x词'));
    expect(web).toEqual({ source: 'web', supports: 'none', answer: '没查成：timed out' });
    expect(failing.logs.at(-1)).toContain('unknown lookup failed');
    const offline = setup({ withWeb: false });
    expect(await offline.resolver.offline(unknown('x词'))).toHaveLength(1);
  });

  it('judges it on what a Douyin search read, citing only what was read; none when it read nothing', async () => {
    const { resolver, asked } = setup({
      douyin: { supports: 'full', answer: '直播切片', refs: ['p1', 'p9'] },
    });
    const read = [{ item: item('p1'), comments: [], material: null }];
    expect(await resolver.onDouyin(unknown('某梗', '梗'), read)).toEqual({
      source: 'douyin',
      supports: 'full',
      answer: '直播切片',
      refs: ['p1'],
    });
    expect(asked[0]).toContain('只根据这些材料判断');
    expect(await resolver.onDouyin(unknown('某梗', '梗'), [])).toMatchObject({ supports: 'none' });
  });
});
