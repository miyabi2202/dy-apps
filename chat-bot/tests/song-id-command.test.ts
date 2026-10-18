import type { LyricHit } from '../src/core/lyrics';
import { SongId } from '../src/app/song-id-command';
import { silentLog } from './fakes';

const hit = (title: string, artist: string): LyricHit => ({
  title,
  artist,
  url: `https://j-lyric.net/${title}`,
});

function prepare(sung: string[], search: (fragment: string) => Promise<LyricHit[]>) {
  const songId = new SongId({
    prompt: () => '',
    search,
    sungLines: () => sung,
    claude: () => Promise.resolve(''),
    log: silentLog,
  });
  const [command] = songId.commands();
  if (!command?.prompt) throw new Error('/识歌 should have its own prompt');
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

test('/识歌模型 switches between Codex, Gemini and Claude, Codex first when there is one', async () => {
  const askedBy: string[] = [];
  const model = (name: string) => () => {
    askedBy.push(name);
    return Promise.resolve('');
  };
  const songId = new SongId({
    prompt: () => '',
    sungLines: () => [],
    claude: model('claude'),
    codex: model('codex'),
    gemini: model('gemini'),
    log: silentLog,
  });
  const [identify, switchModel] = songId.commands();
  if (!identify?.prompt || !switchModel?.run) throw new Error('missing commands');
  const ask = () => identify.ask?.({ prompt: '' });

  await ask();
  expect(switchModel.run('Gemini')).toEqual({ ok: true, reply: '已处理识歌模型请求' });
  await ask();
  expect(switchModel.run('claude')).toEqual({ ok: true, reply: '已处理识歌模型请求' });
  await ask();
  expect(switchModel.run('gpt')).toEqual({
    ok: false,
    reply: '要写 codex、gemini 或 claude，用法：/识歌模型 codex',
  });
  expect(askedBy).toEqual(['codex', 'gemini', 'claude']);

  // Only what's there can be picked, and without Codex or Gemini, Claude it is.
  const claudeOnly = new SongId({
    prompt: () => '',
    sungLines: () => [],
    claude: model('claude'),
    log: silentLog,
  });
  expect(claudeOnly.engine).toBe('claude');
  expect(claudeOnly.commands()[1]?.run?.('codex')).toEqual({
    ok: false,
    reply: '没有装 codex，可以用的有：claude',
  });
});
