import { SongId } from '../src/app/song-id';
import { silentLog } from './fakes';

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
