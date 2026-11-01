import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postsFile } from '../../../src/adapters/files/posts-file';

test("reads the room's posts file on every use: none without it, then what was written", () => {
  const path = join(mkdtempSync(join(tmpdir(), 'room-')), 'memory', 'posts.md');
  const posts = postsFile(path, 2);
  expect(posts.recent()).toBe('');

  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    '- 2026-10-29：甲 [id:1]\n- 2026-10-30：乙 [id:2]\n- 2026-10-31：丙 [id:3]\n',
  );
  expect(posts.recent()).toBe('2026-10-30：乙\n2026-10-31：丙');

  writeFileSync(path, '- 2026-11-01：新的 [id:4]\n');
  expect(posts.recent()).toBe('2026-11-01：新的');
});
