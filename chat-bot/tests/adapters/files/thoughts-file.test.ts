import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { thoughtsFile } from '../../../src/adapters/files/thoughts-file';

test('adds thoughts a line each under their day, and gives the latest oldest first', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'room-')), 'memory', 'thoughts.md');
  const thoughts = thoughtsFile(path);
  expect(thoughts.recent(6)).toBe('');

  thoughts.add('2026-10-30', ['想问主人\n后来怎么样了', ' ']);
  thoughts.add('2026-10-31', ['阿拂最爱周杰伦', '认错了一首歌，不是我的问题']);
  expect(readFileSync(path, 'utf8')).toBe(
    '2026-10-30：想问主人 后来怎么样了\n2026-10-31：阿拂最爱周杰伦\n2026-10-31：认错了一首歌，不是我的问题\n',
  );
  expect(thoughts.recent(2)).toBe(
    '2026-10-31：阿拂最爱周杰伦\n2026-10-31：认错了一首歌，不是我的问题',
  );

  // A hand edit is read as it is.
  writeFileSync(path, '2026-10-29：手写的\n\n');
  expect(thoughts.recent(6)).toBe('2026-10-29：手写的');
});
