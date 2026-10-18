import {
  answerBudget,
  oneMessage,
  plainMessage,
  replyMessages,
  singleBudget,
} from '../src/core/reply';

const limits = { maxLength: 30, maxParts: 3 };

test('a short answer is one message with the whole nickname', () => {
  expect(replyMessages('向你看齐哦', '等于2', limits)).toEqual(['@向你看齐哦 等于2']);
});

test('the nickname is cut to 3 characters when that makes the answer fit in one message', () => {
  const answer = '一二三四五六七八九十一二三四五六七八九十一二三四'; // 24: 30 with the short @ only
  expect(replyMessages('向你看齐哦', answer, limits)).toEqual([`@向你看 ${answer}`]);
  expect(singleBudget('向你看齐哦', limits)).toBe(25);
  expect(oneMessage('向你看齐哦', '一'.repeat(26), 30)).toBeNull();
});

test('a long answer is numbered parts with the short @, cut after punctuation', () => {
  const messages = replyMessages(
    '向你看齐哦',
    '先求导得到2x，令其为零，所以x等于0；再代回原式，最小值是1。',
    limits,
  );

  expect(messages).toEqual([
    '@向你看 (1/2) 先求导得到2x，令其为零，',
    '@向你看 (2/2) 所以x等于0；再代回原式，最小值是1。',
  ]);
  for (const m of messages) expect([...m].length).toBeLessThanOrEqual(30);
  expect(answerBudget('向你看齐哦', limits)).toBe(Math.floor(19 * 3 * 0.85));
});

test('what does not fit in the parts is cut off', () => {
  const messages = replyMessages('雅', '一二三四五六七八九十'.repeat(8), limits);

  expect(messages).toHaveLength(3);
  expect(messages.every((m) => [...m].length === 30)).toBe(true);
});

test('drops Claude’s own @ of the asker, whole or short', () => {
  expect(replyMessages('向你看齐哦', '@向你看齐哦 @向你看 好的', limits)).toEqual([
    '@向你看齐哦 好的',
  ]);
});

test('sends only what follows the last 弹幕： mark, so Claude’s thinking before it stays out', () => {
  const wide = { maxLength: 49, maxParts: 5 };
  expect(
    replyMessages('雅', '没有歌词可用。认不出来。\n\n弹幕：暂时没听到主播唱，认不出来', wide),
  ).toEqual(['@雅 暂时没听到主播唱，认不出来']);
  expect(replyMessages('雅', '先查一下。\n**弹幕：** 是中岛美嘉的《ALWAYS》', wide)).toEqual([
    '@雅 是中岛美嘉的《ALWAYS》',
  ]);
  // Without the mark, the whole answer, as before; a 弹幕 mid-sentence isn't a mark.
  expect(replyMessages('雅', '这条弹幕：很有意思', wide)).toEqual(['@雅 这条弹幕：很有意思']);
  expect(plainMessage('想想说什么好\n弹幕：主播这首好好听', 49)).toBe('主播这首好好听');
});
