import {
  combinedScore,
  pinyinScores,
  pinyinTokens,
  bestOfLines,
  recalled,
  recallLines,
  recallQuery,
  similarity,
  withoutNames,
} from '../../../src/core/memory/recall';

test('similarity is the dot product of normalized vectors', () => {
  expect(similarity([1, 0], [1, 0])).toBe(1);
  expect(similarity([1, 0], [0, 1])).toBe(0);
  expect(similarity([0.6, 0.8], [0.8, 0.6])).toBeCloseTo(0.96);
});

test('recalls those scoring at least the cutoff, the highest, oldest first', () => {
  const scores = [0.6, 0.1, 0.9, 0.55];
  expect(recalled(scores, { cutoff: 0.5, max: 2 })).toEqual([0, 2]);
  expect(recalled(scores, { cutoff: 0.5, max: 5 })).toEqual([0, 2, 3]);
  expect(recalled(scores, { cutoff: 0.95, max: 5 })).toEqual([]);
});

test('a text sounds like pairs of toneless syllables, mixed-up sounds merged, and its ASCII words', () => {
  // zh merged into z.
  expect(pinyinTokens('三角洲')).toEqual(['san jiao', 'jiao zou']);
  expect(pinyinTokens('稻')).toEqual(['dao']);
  expect(pinyinTokens('打 Fairy 好')).toEqual(['da', 'hao', 'fairy']);
});

test('a word heard as another that sounds alike still matches by sound', () => {
  const docs = ['主人今晚要打三角洲', '小黑趴在招财布上', '拉面卖完了'];
  const [delta, cat, ramen] = pinyinScores(docs, '酸角粥开了吗');
  expect(delta).toBeGreaterThan(0);
  expect(cat).toBe(0);
  expect(ramen).toBe(0);
});

test('the score is mostly meaning and a little sound, the sound capped', () => {
  expect(combinedScore(0.5, 0)).toBeCloseTo(0.425);
  expect(combinedScore(0.5, 6.4)).toBeCloseTo(0.575);
  expect(combinedScore(0.5, 100)).toBeCloseTo(0.575);
  expect(combinedScore(0.5, 1, { weight: 0.5, scale: 1 })).toBeCloseTo(0.75);
});

test("the bot's own names are left out, in any case", () => {
  expect(withoutNames('Fairy 在吗 fairy', ['Fairy', ''])).toBe('  在吗  ');
  expect(withoutNames('a.b', ['.'])).toBe('a b');
});

test("the query is the streamer's last lines and the last chats, newest last, cut from the oldest", () => {
  expect(
    recallQuery(['一', '二', '三'], ['a', ' ', 'b  c'], { speechLines: 2, chatLines: 2 }),
  ).toBe('二\n三\nb c');
  expect(recallQuery(['很长的一句话'], ['短'], { maxChars: 3 })).toBe('短');
  expect(recallQuery([], [])).toBe('');
});

test('the window is its lines, which recallQuery joins', () => {
  expect(recallLines(['一', '二'], ['a  b', ''])).toEqual(['一', '二', 'a b']);
  expect(recallQuery(['一', '二'], ['a  b'])).toBe('一\n二\na b');
  expect(recallLines(['很长的一句话'], [], { maxChars: 3 })).toEqual(['一句话']);
});

test('each item scores its best line', () => {
  expect(
    bestOfLines([
      [0.2, 0.9, 0.1],
      [0.7, 0.3, 0.1],
    ]),
  ).toEqual([0.7, 0.9, 0.1]);
  expect(bestOfLines([])).toEqual([]);
});
