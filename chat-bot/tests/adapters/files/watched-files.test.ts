import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchedFiles } from '../../../src/adapters/files/watched-files';

test('reads the lines of the days asked for, without the dash and the id, the latest few oldest first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'watched-'));
  const watched = watchedFiles(dir);
  expect(watched.recent(['2026-10-30', '2026-10-31'], 5)).toEqual([]);

  writeFileSync(
    join(dir, '2026-10-30.md'),
    '# 2026-10-30 刷到的\n\n- 看了 @甲 的视频「猫」，用的声音：歌 [id:1]\n- 看了 @乙 的视频「饭」 [id:2]\n',
  );
  writeFileSync(join(dir, '2026-10-31.md'), '# x\n\n- 看了 @丙 的视频「雨」 [id:3]\n');
  writeFileSync(join(dir, '2026-10-29.md'), '- 看了 @丁 的视频「旧的」 [id:0]\n');
  expect(watched.recent(['2026-10-31', '2026-10-30'], 5)).toEqual([
    '看了 @甲 的视频「猫」，用的声音：歌',
    '看了 @乙 的视频「饭」',
    '看了 @丙 的视频「雨」',
  ]);
  expect(watched.recent(['2026-10-30', '2026-10-31'], 2)).toEqual([
    '看了 @乙 的视频「饭」',
    '看了 @丙 的视频「雨」',
  ]);
});
