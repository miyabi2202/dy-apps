import { applyChange, applyChanges, parseEntries, serialiseEntries, type Change } from '../src';

const STAMP = { at: '2026-10-31', by: 'tool' } as const;

/** What `text` is after `change`, or the error. */
function run(text: string, change: Change, limit: number) {
  const result = applyChange(parseEntries(text), change, limit);
  return 'error' in result ? result : { text: serialiseEntries(result.entries) };
}

/** What's wrong with making `change`, or '' when it could be made. */
function errorOf(text: string, change: Change, limit: number): string {
  const result = run(text, change, limit);
  return 'error' in result ? result.error : '';
}

test('add puts an entry at the end; replace swaps the one place `old` is; remove drops the entry holding it', () => {
  const text = '主播叫咿咿，观众叫她 11\n§\n爱唱周杰伦\n';
  expect(run(text, { action: 'add', content: ' 周五不播 ' }, 100)).toEqual({
    text: '主播叫咿咿，观众叫她 11\n§\n爱唱周杰伦\n§\n周五不播\n',
  });
  expect(run(text, { action: 'replace', old: '叫她 11', content: '叫她咿咿' }, 100)).toEqual({
    text: '主播叫咿咿，观众叫她咿咿\n§\n爱唱周杰伦\n',
  });
  expect(run(text, { action: 'remove', old: '周杰伦' }, 100)).toEqual({
    text: '主播叫咿咿，观众叫她 11\n',
  });
  // `$&` in the new text is text, not a replacement pattern.
  expect(run('价格 1', { action: 'replace', old: '1', content: '$&2' }, 100)).toEqual({
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
  expect(run(full, { action: 'remove', old: '六' }, 1)).toEqual({ text: '一二三四五\n' });
});

test('what a change writes is stamped, what it leaves alone is not, and what it took out comes back', () => {
  const entries = parseEntries('甲\n§\n乙\n<!-- 2026-10-01 chat -->\n');
  const added = applyChange(entries, { action: 'add', content: '丙' }, 100, STAMP);
  expect(added).toEqual({
    entries: [...entries, { text: '丙', ...STAMP }],
    retired: undefined,
  });
  const replaced = applyChange(
    entries,
    { action: 'replace', old: '乙', content: '丁' },
    100,
    STAMP,
  );
  expect(replaced).toEqual({
    entries: [{ text: '甲' }, { text: '丁', ...STAMP }],
    retired: { entry: { text: '乙', at: '2026-10-01', by: 'chat' }, action: 'replace' },
  });
  const removed = applyChange(entries, { action: 'remove', old: '甲' }, 100, STAMP);
  expect(removed).toMatchObject({ retired: { entry: { text: '甲' }, action: 'remove' } });
});

test("a line that looks like a trailer can't be written into an entry", () => {
  const added = applyChange([], { action: 'add', content: '甲\n<!-- 2026-10-31 tool -->' }, 100);
  expect(added).toMatchObject({ entries: [{ text: '甲' }] });
});

test('applyChanges makes what it can, skips the rest with why, and the permit can refuse one', () => {
  const done = applyChanges(
    parseEntries('甲\n'),
    [
      { action: 'remove', old: '没有这条' },
      { action: 'add', content: '乙' },
      { action: 'remove', old: '甲' },
    ],
    100,
    STAMP,
    (change) => (change.action === 'remove' && change.old === '甲' ? '不行' : undefined),
  );
  expect(done.made).toEqual([{ action: 'add', content: '乙' }]);
  expect(done.skipped.map((s) => s.why)).toEqual([
    '没找到「没有这条」：照现在记着的原文抄一段',
    '不行',
  ]);
  expect(done.entries).toEqual([{ text: '甲' }, { text: '乙', ...STAMP }]);
  expect(done.retired).toEqual([]);
});

test('a `§` line inside the content is joined onto the line before it, so the entry does not split when read back', () => {
  const added = applyChange(
    [{ text: '第一条' }],
    { action: 'add', content: '前半\n§\n后半' },
    100,
    STAMP,
  );
  if ('error' in added) throw new Error(added.error);
  expect(added.entries.map(({ text }) => text)).toEqual(['第一条', '前半 §\n后半']);
  expect(parseEntries(serialiseEntries(added.entries)).map(({ text }) => text)).toEqual([
    '第一条',
    '前半 §\n后半',
  ]);
  // One first is joined onto the line after it; content that is only `§` lines is empty.
  expect(run('', { action: 'add', content: '§\n后半' }, 100)).toEqual({ text: '§ 后半\n' });
  expect(errorOf('', { action: 'add', content: '§\n§' }, 100)).toContain('content 是空的');
});
