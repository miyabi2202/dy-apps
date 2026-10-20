import { wordingOf, wordingSections } from '../src/core/wording';

const FILE =
  '# Wording\n\nintro text\n\n## one\n\nfirst {{a}}\n\nsecond\n\n## two\n\n{{b}} and {{a}}\n';

test('splits the file into its ## sections, without headings or the blank lines around them', () => {
  expect([...wordingSections(FILE)]).toEqual([
    ['one', 'first {{a}}\n\nsecond'],
    ['two', '{{b}} and {{a}}'],
  ]);
});

test('fills in the keys given, leaves the others, and says which section is missing', () => {
  const wording = wordingOf(() => FILE);
  expect(wording('one', { a: 1 })).toBe('first 1\n\nsecond');
  expect(wording('two', { a: '' })).toBe('{{b}} and ');
  expect(() => wording('three')).toThrow('wording.md has no section "three"');
});
