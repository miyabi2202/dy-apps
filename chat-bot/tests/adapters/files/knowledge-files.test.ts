import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knowledgeFiles } from '../../../src/adapters/files/knowledge-files';

test('reads every .md file in the folder, by name, again on every call', () => {
  const dir = mkdtempSync(join(tmpdir(), 'knowledge-'));
  writeFileSync(join(dir, 'pk.md'), '## PK\n\n连线比拼。\n');
  writeFileSync(join(dir, 'fan-club.md'), '## 灯牌\n\n粉丝团的徽章。\n');
  writeFileSync(join(dir, 'notes.txt'), '## 不算\n\n不是 .md。\n');
  const entries = knowledgeFiles(dir);
  expect(entries().map(({ title }) => title)).toEqual(['灯牌', 'PK']);

  writeFileSync(join(dir, 'pk.md'), '## PK\n\n改过了。\n');
  expect(entries()[1]!.text).toBe('## PK\n\n改过了。');
});

test('is empty when the folder is not there', () => {
  expect(knowledgeFiles(join(tmpdir(), 'no-such-knowledge-folder'))()).toEqual([]);
});
