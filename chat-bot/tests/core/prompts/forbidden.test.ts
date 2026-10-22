import { forbiddenIn, forbiddenWordsOf } from '../../../src/core/prompts/forbidden';

test("forbidden-words.md's words are its list items; the rest of the file is notes", () => {
  expect(
    forbiddenWordsOf('# Forbidden words\n\nNotes about `{{x}}`.\n\n- 警\n-  编制 \n* 第三个\n'),
  ).toEqual(['警', '编制', '第三个']);
});

test('finds each forbidden word a message has, anywhere in it', () => {
  expect(forbiddenIn('跨区出警得先找雅批条', ['警', '编制'])).toEqual(['警']);
  expect(forbiddenIn('咿咿讲题', ['警', '编制'])).toEqual([]);
});
