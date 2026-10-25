import {
  forbiddenTopicsOf,
  forbiddenWordsOf,
  withoutForbidden,
} from '../../../src/core/prompts/forbidden';

test("forbidden.md's topics are its ## Topics section as it is, empty without one", () => {
  const file = [
    '# Forbidden',
    '',
    'Notes.',
    '',
    '## Topics',
    '',
    '- 不碰投资理财',
    '  - 股票、基金',
    '',
  ];
  expect(forbiddenTopicsOf(file.join('\n'))).toBe('- 不碰投资理财\n  - 股票、基金');
  expect(forbiddenTopicsOf('# Forbidden\n')).toBe('');
});

test('forbidden-words.json is word to replacement; anything but a string is no replacement', () => {
  expect(forbiddenWordsOf('{"酒": "8+1", "警": "", "编制": null}')).toEqual({
    酒: '8+1',
    警: '',
    编制: '',
  });
  expect(() => forbiddenWordsOf('["酒"]')).toThrow();
});

test('a forbidden word is swapped for its replacement, or for a * a character; longer words first', () => {
  const words = { 酒: '8+1', 编制: '', 哔哩: '', 哔哩哔哩: '' };
  expect(withoutForbidden('喝酒不开车，编制内', words)).toBe('喝8+1不开车，**内');
  expect(withoutForbidden('去哔哩哔哩看', words)).toBe('去****看');
  expect(withoutForbidden('咿咿讲题', words)).toBe('咿咿讲题');
  expect(withoutForbidden('a.b', { '.': '' })).toBe('a*b');
});
