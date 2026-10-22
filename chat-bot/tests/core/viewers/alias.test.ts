import { matchChat, matchSpeech, type Alias } from '../../../src/core/viewers/alias';

const aliases: Alias[] = [
  { name: '默认关闭', heardAs: [] },
  { name: 'Fairy', heardAs: ['ferry'] },
  { name: '菲瑞', heardAs: [] },
];

test('a chat calls the bot by a name as written, Latin letters in any case', () => {
  expect(matchChat('FAIRY 来一首', aliases)).toBe('Fairy');
  expect(matchChat('菲瑞你好', aliases)).toBe('菲瑞');
  expect(matchChat('默认关闭 在吗', aliases)).toBe('默认关闭');
  // Not as speech recognition hears it, nor what only sounds like it.
  expect(matchChat('ferry 你好', aliases)).toBeUndefined();
  expect(matchChat('默认关壁在吗', aliases)).toBeUndefined();
  expect(matchChat('今晚吃火锅', aliases)).toBeUndefined();
  expect(matchChat('随便', [{ name: '  ', heardAs: [] }])).toBeUndefined();
});

test('the streamer calls it by a name, a heardAs, or Chinese that sounds the same', () => {
  expect(matchSpeech('FAIRY 你来唱一首', aliases)).toBe('Fairy');
  expect(matchSpeech('FERRY 你来唱一首', aliases)).toBe('Fairy');
  expect(matchSpeech('默认关壁你说呢', aliases)).toBe('默认关闭');
  // zh/z and the like are mixed up by speech recognition too.
  expect(matchSpeech('飞锐在吗', aliases)).toBe('菲瑞');
  expect(matchSpeech('默认今天关闭', aliases)).toBeUndefined();
  expect(matchSpeech('今晚吃火锅', aliases)).toBeUndefined();
});
