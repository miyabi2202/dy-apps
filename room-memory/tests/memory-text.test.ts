import { applyChange, parseEntries, serialiseEntries, type Change } from '../src';

/** What's wrong with making `change`, or '' when it could be made. */
function errorOf(text: string, change: Change, limit: number): string {
  const result = applyChange(text, change, limit);
  return 'error' in result ? result.error : '';
}

test('a memory file is entries between § lines; empty ones and spaces around them are dropped', () => {
  expect(parseEntries('主播叫咿咿\n\n§\n  爱唱周杰伦  \n§\n\n§\n')).toEqual([
    { text: '主播叫咿咿' },
    { text: '爱唱周杰伦' },
  ]);
  expect(parseEntries('')).toEqual([]);
  expect(serialiseEntries([{ text: '甲' }, { text: '乙' }])).toBe('甲\n§\n乙\n');
  expect(serialiseEntries([])).toBe('');
});

test('add puts an entry at the end; replace swaps the one place `old` is; remove drops the entry holding it', () => {
  const text = '主播叫咿咿，观众叫她 11\n§\n爱唱周杰伦\n';
  expect(applyChange(text, { action: 'add', content: ' 周五不播 ' }, 100)).toEqual({
    text: '主播叫咿咿，观众叫她 11\n§\n爱唱周杰伦\n§\n周五不播\n',
  });
  expect(
    applyChange(text, { action: 'replace', old: '叫她 11', content: '叫她咿咿' }, 100),
  ).toEqual({ text: '主播叫咿咿，观众叫她咿咿\n§\n爱唱周杰伦\n' });
  expect(applyChange(text, { action: 'remove', old: '周杰伦' }, 100)).toEqual({
    text: '主播叫咿咿，观众叫她 11\n',
  });
  // `$&` in the new text is text, not a replacement pattern.
  expect(applyChange('价格 1', { action: 'replace', old: '1', content: '$&2' }, 100)).toEqual({
    text: '价格 $&2\n',
  });
});

test('old must be found in exactly one place, and nothing is changed when it is not', () => {
  const text = '爱唱晴天\n§\n不爱唱晴天\n';
  expect(errorOf(text, { action: 'remove', old: '稻香' }, 100)).toContain('没找到');
  expect(errorOf(text, { action: 'remove', old: '晴天' }, 100)).toContain('不止一处');
  expect(errorOf('晴天和晴天', { action: 'replace', old: '晴天', content: '雨天' }, 100)).toContain(
    '不止一处',
  );
  expect(errorOf(text, { action: 'add', content: '  ' }, 100)).toContain('空');
});

test('a change past the limit is refused with a word to merge first; removing always works', () => {
  const full = serialiseEntries([{ text: '一二三四五' }, { text: '六七八九十' }]);
  expect(errorOf(full, { action: 'add', content: '多' }, 14)).toContain('上限 14 字');
  expect(applyChange(full, { action: 'remove', old: '六' }, 1)).toEqual({ text: '一二三四五\n' });
});
