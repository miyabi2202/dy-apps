import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { memoryLength, parseEntries, serialiseEntries, withoutTrailers } from '../src';

test('a memory file is entries between § lines; empty ones and spaces around them are dropped', () => {
  expect(parseEntries('主播叫咿咿\n\n§\n  爱唱周杰伦  \n§\n\n§\n')).toEqual([
    { text: '主播叫咿咿' },
    { text: '爱唱周杰伦' },
  ]);
  expect(parseEntries('')).toEqual([]);
  expect(serialiseEntries([{ text: '甲' }, { text: '乙' }])).toBe('甲\n§\n乙\n');
  expect(serialiseEntries([])).toBe('');
});

test('an entry the module wrote ends with a trailer line, which reads back as its date and author', () => {
  const text = '甲\n<!-- 2026-10-30 tool -->\n§\n乙\n§\n丙\n<!-- 2026-10-31 chat -->\n';
  const entries = parseEntries(text);
  expect(entries).toEqual([
    { text: '甲', at: '2026-10-30', by: 'tool' },
    { text: '乙' },
    { text: '丙', at: '2026-10-31', by: 'chat' },
  ]);
  expect(serialiseEntries(entries)).toBe(text);
});

test("a prompt has the entries without the trailers, and they don't count towards the limit", () => {
  const text = '甲\n<!-- 2026-10-30 tool -->\n§\n乙\n';
  expect(withoutTrailers(text)).toBe('甲\n§\n乙\n');
  expect(memoryLength(text)).toBe(memoryLength('甲\n§\n乙\n'));
});

test('a file from before dates reads as undated and as a prompt is the same text, byte for byte', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'memory-before-dates.md'), 'utf8');
  const entries = parseEntries(text);
  expect(entries.length).toBeGreaterThan(3);
  expect(entries.every((entry) => entry.at === undefined && entry.by === undefined)).toBe(true);
  expect(withoutTrailers(text)).toBe(text);
});
