import {
  answerBudget,
  atName,
  plainMessages,
  replyMessages,
  unaddressedMessages,
  singleBudget,
} from '../../../src/core/replies/reply';

const limits = { maxLength: 30, maxParts: 3 };

test('a short answer is one message with the whole nickname', () => {
  expect(replyMessages('向你看齐哦', '等于2', limits)).toEqual(['@向你看齐哦 等于2']);
});

test('the nickname is cut to 3 characters when that makes the answer fit in one message', () => {
  const answer = '一二三四五六七八九十一二三四五六七八九十一二三四'; // 24: 30 with the short @ only
  expect(replyMessages('向你看齐哦', answer, limits)).toEqual([`@向你看 ${answer}`]);
  expect(singleBudget('向你看齐哦', limits)).toBe(25);
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
  expect(plainMessages('想想说什么好\n弹幕：主播这首好好听', wide)).toEqual(['主播这首好好听']);
});

test('finds the 弹幕： mark after a sentence on the same line, or at the end, as other models write it', () => {
  const wide = { maxLength: 49, maxParts: 5 };
  expect(replyMessages('雅', '原唱是 nachi。弹幕：这首是《サクラ・ホライズン》！', wide)).toEqual([
    '@雅 这首是《サクラ・ホライズン》！',
  ]);
  // A mark at the end, after the message.
  expect(replyMessages('雅', '弹幕：听着像《サクラ・ホライズン》，不太确定诶弹幕：', wide)).toEqual(
    ['@雅 听着像《サクラ・ホライズン》，不太确定诶'],
  );
  expect(replyMessages('雅', '没认出来，求提示歌名～\n\n弹幕：', wide)).toEqual([
    '@雅 没认出来，求提示歌名～',
  ]);
  // Two marks on the line are one message.
  expect(replyMessages('雅', '弹幕：是中岛美嘉的《ALWAYS》！弹幕：唱得好好听～', wide)).toEqual([
    '@雅 是中岛美嘉的《ALWAYS》！唱得好好听～',
  ]);
});

test('the @ goes without the room 单推符号 at the start of the nickname, as often as they are there', () => {
  expect(atName('⊹꙳𝝑阿拂（吃荷灵咪馊饭版）𝝔⋆₊', ['⊹꙳𝝑'])).toBe('阿拂（吃荷灵咪馊饭版）𝝔⋆₊');
  // Longest first, repeatedly, and the space after them too.
  expect(atName('🍭🍭 星落', ['🍭', '🍭🍭'])).toBe('星落');
  expect(atName('SL.⊹꙳𝝑茜颜', ['⊹꙳𝝑', 'SL.'])).toBe('茜颜');
  // Not in the middle, and never down to nothing.
  expect(atName('阿拂⊹꙳𝝑', ['⊹꙳𝝑'])).toBe('阿拂⊹꙳𝝑');
  expect(atName('⊹꙳𝝑', ['⊹꙳𝝑'])).toBe('⊹꙳𝝑');
  expect(atName('阿拂')).toBe('阿拂');
});

test('what the bot says to nobody in particular is split like a reply, without the @', () => {
  const limits = { maxLength: 24, maxParts: 3 };
  expect(plainMessages('这首好听', limits)).toEqual(['这首好听']);
  expect(plainMessages('这首是续作里的重编版，同一首歌，刚才那下是我画蛇添足', limits)).toEqual([
    '(1/2) 这首是续作里的重编版，同一首歌，',
    '(2/2) 刚才那下是我画蛇添足',
  ]);
});

test('forbidden words are swapped before the cut, so the parts fit what is really sent', () => {
  const limits = { maxLength: 12, maxParts: 3, forbidden: { 酒: '8+1' } };
  // 11 characters fit in one message, but not once each 酒 is 8+1.
  expect(plainMessages('喝酒了，喝酒了，喝酒了', limits)).toEqual([
    '(1/3) 喝8+1了，',
    '(2/3) 喝8+1了，',
    '(3/3) 喝8+1了',
  ]);
  expect(replyMessages('阿明', '@阿明 少喝酒', limits)).toEqual(['@阿明 少喝8+1']);
});

test('an answer without the @ takes off one Claude started with, and splits like the room messages', () => {
  const limits = { maxLength: 50, maxParts: 3, forbidden: {}, atTrimStart: [] };
  expect(unaddressedMessages('向你看齐哦', '@向你看齐哦 等于2', limits)).toEqual(['等于2']);
  expect(unaddressedMessages('向你看齐哦', '等于2', limits)).toEqual(['等于2']);
});
