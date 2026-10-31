import { KnowledgeRecall } from '../../../src/app/knowledge/knowledge-recall';
import type { Embedder, VectorCache } from '../../../src/app/ports';
import { parseKnowledge } from '../../../src/core/knowledge/entries';
import { silentLog } from '../../support/fakes';

/** A fake model: a text's vector says which of a few topics it mentions, so texts on one topic are alike. */
const TOPICS = ['抽奖', '比拼', '徽章'];
function vectorOf(text: string): number[] {
  const v = TOPICS.map((topic) => (text.includes(topic) ? 1 : 0));
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}

const KNOWLEDGE = parseKnowledge(`## 灯牌

aliases: 保牌子
灯牌是主播粉丝团的徽章。

## PK

aliases: 偷塔
PK 是两个主播连线比拼。

## 福袋

福袋是主播发的抽奖。
`);

function setup({
  wholeUnder = 0,
  cutoff = 0.5,
  embedding = true,
  failing = false,
}: { wholeUnder?: number; cutoff?: number | null; embedding?: boolean; failing?: boolean } = {}) {
  let speech: string[] = [];
  let chat: string[] = [];
  const embedder: Embedder = {
    info: () =>
      failing ? Promise.reject(new Error('not running')) : Promise.resolve({ model: 'm', cutoff }),
    embed: (texts) => Promise.resolve(texts.map(vectorOf)),
  };
  const store = new Map<string, number[]>();
  const vectors: VectorCache = {
    get: (_, texts) => texts.map((text) => store.get(text)),
    put: (_, entries) => entries.forEach(([text, vector]) => store.set(text, vector)),
  };
  const warnings: string[] = [];
  const timers: (() => void)[] = [];
  const recall = new KnowledgeRecall({
    embedder: embedding ? embedder : null,
    vectors,
    entries: () => KNOWLEDGE,
    speech: () => speech,
    chat: () => chat,
    names: () => ['Fairy'],
    log: { ...silentLog, warn: (message) => void warnings.push(message) },
    wholeUnder,
    pinyinWeight: 0,
    setTimer: (run) => {
      timers.push(run);
      return () => timers.splice(timers.indexOf(run), 1);
    },
  });
  return {
    recall,
    warnings,
    timers,
    say: (lines: { speech?: string[]; chat?: string[] }) => {
      speech = lines.speech ?? speech;
      chat = lines.chat ?? chat;
    },
  };
}

const titles = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

test('while the knowledge is small, every prompt shows all of it without looking', async () => {
  const { recall } = setup({ wholeUnder: 10_000 });
  expect(titles(recall.text())).toEqual(['灯牌', 'PK', '福袋']);
  await recall.refresh();
  expect(titles(recall.text())).toEqual(['灯牌', 'PK', '福袋']);
});

test('once it is bigger, nothing shows until the room says something that fits', async () => {
  const { recall, say } = setup();
  expect(recall.text()).toBe('');
  say({ chat: ['今天天气不错'] });
  await recall.refresh();
  expect(recall.text()).toBe('');
});

test('an entry whose alias is said comes to mind, and one that fits by meaning besides', async () => {
  const { recall, say } = setup();
  say({ speech: ['等下要偷塔了'], chat: ['主播什么时候搞抽奖'] });
  await recall.refresh();
  expect(titles(recall.text())).toEqual(['PK', '福袋']);
});

test('without the embedding service, or a measured cutoff, only the named entries come to mind', async () => {
  for (const options of [{ embedding: false }, { cutoff: null }]) {
    const { recall, say } = setup(options);
    say({ chat: ['记得保牌子', '主播什么时候搞抽奖'] });
    await recall.refresh();
    expect(titles(recall.text())).toEqual(['灯牌']);
  }
});

test('when the service fails it warns once and still finds the named entries', async () => {
  const { recall, say, warnings } = setup({ failing: true });
  say({ chat: ['记得保牌子'] });
  await recall.refresh();
  say({ chat: ['偷塔偷塔'] });
  await recall.refresh();
  expect(titles(recall.text())).toEqual(['PK']);
  expect(warnings).toHaveLength(1);
});

test('a burst of chat is one look, a moment after it; stopping cancels it', () => {
  const { recall, timers } = setup();
  recall.hear();
  recall.hear();
  recall.hear();
  expect(timers).toHaveLength(1);
  recall.stop();
  expect(timers).toHaveLength(0);
});
