import { SongId } from '../src/app/song-id-command';
import { silentLog } from './fakes';

test('/识歌模型 switches between Codex and Claude, Codex first when there is one', async () => {
  const askedBy: string[] = [];
  const model = (name: string) => () => {
    askedBy.push(name);
    return Promise.resolve('');
  };
  const songId = new SongId({
    prompt: () => 'claude prompt',
    webPrompt: () => 'web prompt',
    claude: model('claude'),
    codex: model('codex'),
    log: silentLog,
  });
  const [identify, switchModel] = songId.commands();
  if (!identify?.prompt || !switchModel?.run) throw new Error('missing commands');
  const ask = () => identify.ask?.({ prompt: '' });

  await ask();
  expect(identify.prompt()).toBe('web prompt');
  expect(switchModel.run('Claude')).toEqual({ ok: true, reply: '已处理识歌模型请求' });
  await ask();
  expect(identify.prompt()).toBe('claude prompt');
  expect(switchModel.run('gpt')).toEqual({
    ok: false,
    reply: '要写 codex 或 claude，用法：/识歌模型 codex',
  });
  expect(askedBy).toEqual(['codex', 'claude']);

  // Only what's there can be picked, and without Codex, Claude it is.
  const claudeOnly = new SongId({
    prompt: () => '',
    claude: model('claude'),
    log: silentLog,
  });
  expect(claudeOnly.engine).toBe('claude');
  expect(claudeOnly.commands()[1]?.run?.('codex')).toEqual({
    ok: false,
    reply: '没有装 codex，可以用的有：claude',
  });
});

test('asks for the song as JSON, sends its message, and sends an answer that is not JSON as it is', async () => {
  const schemas: (object | undefined)[] = [];
  const answers = [
    JSON.stringify({ message: '这首是中島美嘉的《ALWAYS》', title: 'ALWAYS', artist: '中島美嘉' }),
    '弹幕：没认出来',
  ];
  const songId = new SongId({
    prompt: () => '',
    claude: ({ schema }) => {
      schemas.push(schema);
      return Promise.resolve(answers.shift() ?? '');
    },
    log: silentLog,
  });
  const [identify] = songId.commands();
  if (!identify?.prompt) throw new Error('/识歌 should have its own prompt');

  await expect(identify.ask?.({ prompt: '' })).resolves.toBe('这首是中島美嘉的《ALWAYS》');
  await expect(identify.ask?.({ prompt: '' })).resolves.toBe('弹幕：没认出来');
  expect(schemas[0]).toMatchObject({ required: ['message', 'title', 'artist'] });
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
    claude: () => Promise.resolve(''),
    log: silentLog,
  });
  const [identify] = songId.commands();
  if (!identify?.prompt) throw new Error('/识歌 should have its own prompt');
  expect(identify.pickTranscript?.([at(0, 'a'), at(120, 'b')]).map((l) => l.text)).toEqual(['b']);
});

test('/识冷门歌 always asks Codex with its own prompt, and is only there with Codex', async () => {
  const askedBy: string[] = [];
  const model = (name: string) => () => {
    askedBy.push(name);
    return Promise.resolve('');
  };
  const options = {
    prompt: () => 'claude prompt',
    rarePrompt: () => 'rare prompt',
    claude: model('claude'),
    log: silentLog,
  };
  const songId = new SongId({ ...options, codex: model('codex') });
  await songId.commands()[1]?.run?.('claude');
  const rare = songId.commands().find((command) => command.name === '识冷门歌');
  if (!rare?.prompt) throw new Error('/识冷门歌 should have its own prompt');

  await rare.ask?.({ prompt: '' });
  expect(rare.prompt()).toBe('rare prompt');
  expect(rare.adminOnly).toBe(false);
  expect(askedBy).toEqual(['codex']);
  expect(new SongId(options).commands().map((command) => command.name)).toEqual([
    '识歌',
    '识歌模型',
  ]);
});
