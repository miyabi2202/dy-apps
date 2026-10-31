import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lifeFiles } from '../../../src/adapters/files/life-files';

test("keeps each persona's days a file each, and gives the latest oldest first", () => {
  const dir = mkdtempSync(join(tmpdir(), 'lives-'));
  const life = lifeFiles(dir);
  expect(life.recent('fairy', 5)).toEqual([]);
  expect(life.has('fairy', '2026-10-30')).toBe(false);

  expect(life.add('fairy', '2026-10-31', '- 今天\n')).toBe(true);
  expect(life.add('fairy', '2026-10-29', '- 前天')).toBe(true);
  expect(life.add('fairy', '2026-10-30', '- 昨天')).toBe(true);
  // Not a day: left out.
  writeFileSync(join(dir, 'fairy', 'notes.txt'), '随手记');

  expect(life.has('fairy', '2026-10-30')).toBe(true);
  expect(life.recent('fairy', 2)).toEqual([
    { date: '2026-10-30', text: '- 昨天' },
    { date: '2026-10-31', text: '- 今天' },
  ]);
  expect(readFileSync(join(dir, 'fairy', '2026-10-31.md'), 'utf8')).toBe('- 今天\n');
  // Another persona's days are her own.
  expect(life.recent('class-rep', 5)).toEqual([]);
});

test('a day already written is kept as it is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lives-'));
  mkdirSync(join(dir, 'fairy'));
  const life = lifeFiles(dir);
  expect(life.add('fairy', '2026-10-31', '- 先写的')).toBe(true);
  expect(life.add('fairy', '2026-10-31', '- 后写的')).toBe(false);
  expect(life.recent('fairy', 1)).toEqual([{ date: '2026-10-31', text: '- 先写的' }]);
});
