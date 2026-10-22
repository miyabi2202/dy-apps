import { SongId } from '../../../src/app/songs/song-id';
import { silentLog } from '../../support/fakes';

test('asks for the song as JSON, sends its message, and sends an answer that is not JSON as it is', async () => {
  const schemas: (object | undefined)[] = [];
  const answers = [
    JSON.stringify({ message: '这首是中島美嘉的《ALWAYS》', title: 'ALWAYS', artist: '中島美嘉' }),
    '弹幕：没认出来',
  ];
  const songId = new SongId({
    prompt: () => '',
    codex: ({ schema }) => {
      schemas.push(schema);
      return Promise.resolve(answers.shift() ?? '');
    },
    log: silentLog,
  });
  const [identify] = songId.commands();
  if (!identify?.prompt) throw new Error('/识歌 should have its own prompt');

  await expect(identify.ask?.({ prompt: '' })).resolves.toBe('这首是中島美嘉的《ALWAYS》');
  await expect(identify.ask?.({ prompt: '' })).resolves.toBe('弹幕：没认出来');
  expect(schemas[0]).toMatchObject({ required: ['message', 'title', 'artist', 'sure'] });
});

test('with too little sung yet, /识歌 says so without asking; with enough, it asks and logs what about', async () => {
  const sung = (s: number, text: string) => ({
    start: s * 1000,
    end: s * 1000 + 4000,
    text,
    speech: 0.05,
  });
  const asked: string[] = [];
  const logged: [string, object | undefined][] = [];
  const songId = new SongId({
    prompt: () => '',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve(
        JSON.stringify({ message: '这首是《晴天》', title: '晴天', artist: '周杰伦', sure: true }),
      );
    },
    log: { ...silentLog, info: (message, meta) => void logged.push([message, meta]) },
    early: {
      minChars: 20,
      noLyrics: () => '没听到在唱',
      tooEarly: (heard) => `才听到「${heard}」`,
    },
  });
  const [identify] = songId.commands();
  if (!identify?.prompt) throw new Error('/识歌 should have its own prompt');
  const ask = (lines: ReturnType<typeof sung>[]) => {
    identify.pickTranscript?.(lines);
    return identify.ask?.({ prompt: '' });
  };

  await expect(ask([{ ...sung(0, '下一首唱什么'), speech: 0.8 }])).resolves.toBe('没听到在唱');
  await expect(ask([sung(0, '刮风这天'), sung(5, '我试过')])).resolves.toBe(
    '才听到「刮风这天」「我试过」',
  );
  expect(asked).toEqual([]);

  await expect(
    ask([sung(0, '刮风这天我试过握着你手'), sung(5, '但偏偏雨渐渐大到我看你不见')]),
  ).resolves.toBe('这首是《晴天》');
  expect(asked).toHaveLength(1);
  expect(logged.find(([m]) => m === 'song id asked')?.[1]).toEqual({
    why: 'command',
    lines: 2,
    chars: 24,
    first: '刮风这天我试过握着你手',
    last: '但偏偏雨渐渐大到我看你不见',
  });
});

test('gives the prompt only the song being sung now, not the one before a pause', () => {
  const at = (s: number, text: string) => ({
    start: s * 1000,
    end: s * 1000 + 4000,
    text,
    speech: 0.05,
  });
  const songId = new SongId({
    prompt: () => '',
    codex: () => Promise.resolve(''),
    log: silentLog,
  });
  const [identify] = songId.commands();
  if (!identify?.prompt) throw new Error('/识歌 should have its own prompt');
  expect(identify.pickTranscript?.([at(0, 'a'), at(120, 'b')]).map((l) => l.text)).toEqual(['b']);
});
