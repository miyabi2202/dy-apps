import { MemoryRecall } from '../../../src/app/memory/memory-recall';
import type { Embedder, LifeDay, VectorCache } from '../../../src/app/ports';
import { silentLog } from '../../support/fakes';

/**
 * A fake model: a text's vector says which of a few topics it mentions, normalized, so texts
 * on the same topic are alike (1), and on different ones not (0).
 */
const TOPICS = ['稻香', '周年', '小黑', '拉面'];
function vectorOf(text: string): number[] {
  const v = TOPICS.map((topic) => (text.includes(topic) ? 1 : 0));
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}

function setup({
  thoughts = [],
  days = [],
  cutoff = 0.5,
  failing = false,
  pinyinWeight,
}: {
  thoughts?: string[];
  days?: LifeDay[];
  /** The model's cutoff; null for not measured. */
  cutoff?: number | null;
  /** Whether the service is down at first. */
  failing?: boolean;
  pinyinWeight?: number;
} = {}) {
  let speech: string[] = [];
  let chat: string[] = [];
  const embedded: { texts: readonly string[]; kind: string }[] = [];
  let down = failing;
  const embedder: Embedder = {
    info: () =>
      down ? Promise.reject(new Error('not running')) : Promise.resolve({ model: 'm', cutoff }),
    embed: (texts, kind) => {
      embedded.push({ texts, kind });
      return Promise.resolve(texts.map(vectorOf));
    },
  };
  const store = new Map<string, number[]>();
  const vectors: VectorCache = {
    get: (_, texts) => texts.map((text) => store.get(text)),
    put: (_, entries) => entries.forEach(([text, vector]) => store.set(text, vector)),
  };
  const warnings: string[] = [];
  const timers: (() => void)[] = [];
  const recall = new MemoryRecall({
    embedder,
    vectors,
    thoughts: { all: () => thoughts },
    life: { recent: (_, count) => days.slice(-count) },
    persona: () => 'fairy',
    speech: () => speech,
    chat: () => chat,
    names: () => ['Fairy'],
    log: { ...silentLog, warn: (message) => void warnings.push(message) },
    pinyinWeight,
    pinyinScale: 1,
    recentThoughts: 2,
    recentDays: 1,
    extra: 2,
    setTimer: (run) => {
      timers.push(run);
      return () => timers.splice(timers.indexOf(run), 1);
    },
  });
  return {
    recall,
    embedded,
    warnings,
    timers,
    say: (lines: { speech?: string[]; chat?: string[] }) => {
      speech = lines.speech ?? speech;
      chat = lines.chat ?? chat;
    },
    setDown: (value: boolean) => (down = value),
  };
}

const THOUGHTS = [
  '2026-10-01：主人说下次唱稻香，下次问问她',
  '2026-10-02：主人下周一周年',
  '2026-10-03：小黑又趴在招财布上',
  '2026-10-29：今天连线很热闹',
  '2026-10-30：主人想学新歌',
];

test('every prompt has the latest thoughts and days, and, once the room says something, older ones that fit it', async () => {
  const days = [
    { date: '2026-10-01', text: '- 拉面卖完了\n- 小黑趴在门口' },
    { date: '2026-10-02', text: '- 塔维斯租走了星徽骑士' },
    { date: '2026-10-31', text: '- 今天下雨' },
  ];
  const { recall, embedded, say } = setup({ thoughts: THOUGHTS, days });
  expect(recall.thoughtsText()).toBe('2026-10-29：今天连线很热闹\n2026-10-30：主人想学新歌');
  expect(recall.lifeDays('fairy')).toEqual([{ date: '2026-10-31', text: '- 今天下雨' }]);

  say({ chat: ['今晚唱稻香吗'], speech: ['小黑呢'] });
  await recall.refresh();
  // Each line being said is a query of its own; each older memory a document, without its date.
  expect(embedded[0]).toEqual({ texts: ['小黑呢', '今晚唱稻香吗'], kind: 'query' });
  expect(embedded[1]!.kind).toBe('document');
  expect(embedded[1]!.texts).toContain('主人说下次唱稻香，下次问问她');
  expect(recall.thoughtsText()).toBe(
    [
      '2026-10-01：主人说下次唱稻香，下次问问她',
      '2026-10-03：小黑又趴在招财布上',
      '2026-10-29：今天连线很热闹',
      '2026-10-30：主人想学新歌',
    ].join('\n'),
  );
  expect(recall.lifeDays('fairy')).toEqual([
    { date: '2026-10-01', text: '- 小黑趴在门口' },
    { date: '2026-10-31', text: '- 今天下雨' },
  ]);
  // Another persona's days aren't hers.
  expect(recall.lifeDays('class-rep')).toEqual([{ date: '2026-10-31', text: '- 今天下雨' }]);
});

test('each memory is embedded once, and the same talk is not looked at again', async () => {
  const { recall, embedded, say } = setup({ thoughts: THOUGHTS });
  say({ chat: ['稻香'] });
  await recall.refresh();
  await recall.refresh();
  say({ chat: ['周年快到了'] });
  await recall.refresh();
  expect(embedded.map(({ kind }) => kind)).toEqual(['query', 'document', 'query']);
  expect(recall.thoughtsText()).toContain('主人下周一周年');
  expect(recall.thoughtsText()).not.toContain('稻香');
});

test('nothing older without a cutoff, or when nothing is alike enough', async () => {
  const noCutoff = setup({ thoughts: THOUGHTS, cutoff: null });
  noCutoff.say({ chat: ['稻香'] });
  await noCutoff.recall.refresh();
  expect(noCutoff.recall.thoughtsText()).toBe(
    '2026-10-29：今天连线很热闹\n2026-10-30：主人想学新歌',
  );

  const unrelated = setup({ thoughts: THOUGHTS });
  unrelated.say({ chat: ['今天天气不错'] });
  await unrelated.recall.refresh();
  expect(unrelated.recall.thoughtsText()).toBe(
    '2026-10-29：今天连线很热闹\n2026-10-30：主人想学新歌',
  );
});

test('without the service it shows the latest only, warns once, and recalls again once it is back', async () => {
  const { recall, warnings, say, setDown } = setup({ thoughts: THOUGHTS, failing: true });
  say({ chat: ['稻香'] });
  await recall.refresh();
  say({ chat: ['稻香呢'] });
  await recall.refresh();
  expect(warnings).toEqual(['memory recall is off: the embedding service did not answer']);
  expect(recall.thoughtsText()).not.toContain('稻香');

  setDown(false);
  await recall.refresh();
  expect(recall.thoughtsText()).toContain('稻香');
});

test('a burst of chat is one look, a moment after the last', () => {
  const { recall, timers } = setup();
  recall.hear();
  recall.hear();
  recall.hear();
  expect(timers).toHaveLength(1);
  recall.stop();
  expect(timers).toHaveLength(0);
});

test("a word heard wrong still brings up its memory by sound, and the bot's own name does not", async () => {
  const thoughts = [
    '2026-10-01：主人说今晚要打三角洲',
    '2026-10-02：有人管机器人叫 fairy',
    '2026-10-29：今天连线很热闹',
    '2026-10-30：主人想学新歌',
  ];
  // Meaning alone finds nothing here (the fake model knows none of these words): the sound does.
  const { recall, say } = setup({ thoughts, pinyinWeight: 0.6, cutoff: 0.3 });
  say({ chat: ['Fairy 酸角粥开了没'] });
  await recall.refresh();
  expect(recall.thoughtsText()).toContain('三角洲');
  expect(recall.thoughtsText()).not.toContain('fairy');
});

test('a memory comes up when one line is about it, and a line already embedded is not embedded again', async () => {
  const { recall, embedded, say } = setup({ thoughts: THOUGHTS });
  // A long window where only one line is about the anniversary: its best line carries it.
  say({ speech: ['今天先唱几首', '谢谢大家'], chat: ['晚上好', '周年活动有吗', '来了来了'] });
  await recall.refresh();
  expect(recall.thoughtsText()).toContain('主人下周一周年');

  say({ chat: ['晚上好', '周年活动有吗', '来了来了', '稻香'] });
  await recall.refresh();
  const queries = embedded.filter(({ kind }) => kind === 'query').map(({ texts }) => texts);
  expect(queries).toEqual([
    ['今天先唱几首', '谢谢大家', '晚上好', '周年活动有吗', '来了来了'],
    ['稻香'],
  ]);
});
