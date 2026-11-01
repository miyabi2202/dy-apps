import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browseThoughtsFiles, watchedFiles } from '../../../src/adapters/files/watched-files';

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

test('reads her browse thoughts the same way: the lines without the dash and the ids', () => {
  const dir = mkdtempSync(join(tmpdir(), 'browse-thoughts-'));
  writeFileSync(
    join(dir, '2026-10-31.md'),
    '# 2026-10-31 刷抖音时的想法\n\n- 那个翻唱好听 [id:1,2]\n- 没有 id 的想法\n',
  );
  expect(browseThoughtsFiles(dir).recent(['2026-10-31'], 5)).toEqual([
    '那个翻唱好听',
    '没有 id 的想法',
  ]);
});
