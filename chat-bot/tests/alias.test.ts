import { matchName } from '../src/core/alias';

test('finds the configured name in the text, Latin letters in any case, Chinese as it is', () => {
  const names = ['默认关闭', 'Fairy', '菲瑞'];
  expect(matchName('FAIRY 来一首', names)).toBe('Fairy');
  expect(matchName('菲瑞你好', names)).toBe('菲瑞');
  expect(matchName('@默认关闭 在吗', names)).toBe('默认关闭');
  expect(matchName('今晚吃火锅', names)).toBeUndefined();
  expect(matchName('随便', ['', '  '])).toBeUndefined();
});
