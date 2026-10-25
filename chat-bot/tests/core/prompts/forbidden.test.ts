import {
  forbiddenIn,
  forbiddenTopicsOf,
  forbiddenWordsOf,
} from '../../../src/core/prompts/forbidden';

const FILE = [
  '# Forbidden',
  '',
  'Notes about `{{x}}`.',
  '',
  '- a note, not a word',
  '',
  '## Topics',
  '',
  '- 不碰投资理财',
  '  - 股票、基金',
  '',
  '## Words',
  '',
  '- 警',
  '-  编制 ',
  '',
  '### Other platforms',
  '',
  '* 快手',
  '',
].join('\n');

test("forbidden.md's words are the list items under ## Words, any ### heading too", () => {
  expect(forbiddenWordsOf(FILE)).toEqual(['警', '编制', '快手']);
  expect(forbiddenWordsOf('- 警\n')).toEqual([]);
});

test("forbidden.md's topics are its ## Topics section as it is, empty without one", () => {
  expect(forbiddenTopicsOf(FILE)).toBe('- 不碰投资理财\n  - 股票、基金');
  expect(forbiddenTopicsOf('## Words\n\n- 警\n')).toBe('');
});

test('finds each forbidden word a message has, anywhere in it', () => {
  expect(forbiddenIn('跨区出警得先找雅批条', ['警', '编制'])).toEqual(['警']);
  expect(forbiddenIn('咿咿讲题', ['警', '编制'])).toEqual([]);
});
