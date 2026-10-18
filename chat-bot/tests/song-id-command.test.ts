import type { LyricHit } from '../src/core/lyrics';
import { songIdCommand } from '../src/app/song-id-command';
import { silentLog } from './fakes';

const hit = (title: string, artist: string): LyricHit => ({
  title,
  artist,
  url: `https://j-lyric.net/${title}`,
});

function prepare(sung: string[], search: (fragment: string) => Promise<LyricHit[]>) {
  const command = songIdCommand(() => '', { search, sungLines: () => sung, log: silentLog });
  if (!command.prompt) throw new Error('/识歌 should have its own prompt');
  return command.prepare?.();
}

test('answers at once when the lyrics point at one song, else tells Claude what was found', async () => {
  const sung = [
    '何もかもが今色褪せて見えるこの世界に。',
    '例えば誰か傷ついても迷わず駆け出して今すぐ。',
  ];
  await expect(prepare(sung, () => Promise.resolve([hit('ALWAYS', '中島美嘉')]))).resolves.toEqual({
    answer: '这首是中島美嘉的《ALWAYS》',
  });

  // Each fragment finds a different song: Claude gets them to check.
  let n = 0;
  await expect(
    prepare(sung, () => Promise.resolve([hit(`歌${++n}`, '某人')])),
  ).resolves.toMatchObject({ lookup: expect.stringContaining('某人《歌1》（1）') as string });

  // A search that fails counts as finding nothing.
  await expect(prepare(sung, () => Promise.reject(new Error('down')))).resolves.toEqual({
    lookup: expect.stringContaining('都没有结果') as string,
  });
  // Nothing Japanese sung: nothing to look up.
  await expect(prepare(['明明你也想我吧'], () => Promise.resolve([]))).resolves.toBeNull();
});
