import { SongId } from '../../src/app/songs/song-id';
import { Transcript } from '../../src/core/songs/transcript';
import { identifySongTool } from '../../src/mcp/identify-song';
import { fakeRoom } from '../support/fake-room';
import { silentLog } from '../support/fakes';

const context = { asker: '苦***', userId: '111111-苦***-31', question: '这是什么歌' };

function setup(options: { lyrics?: 'sure' | 'unsure'; minChars?: number } = {}) {
  let now = 100_000;
  const transcript = new Transcript(Infinity, () => now);
  for (const [i, text] of ['刮风这天我试过握着你手', '但偏偏雨渐渐大到我看你不见'].entries()) {
    transcript.add({
      start: now - 20_000 + i * 5000,
      end: now - 16_000 + i * 5000,
      text,
      speech: 0.05,
    });
  }
  const intros: string[] = [];
  const asked: string[] = [];
  const songId = new SongId({
    prompt: () => '问：{{question}}',
    codex: ({ prompt }) => {
      asked.push(prompt);
      return Promise.resolve(
        JSON.stringify({ message: 'm', title: '晴天', artist: '周杰伦', sure: true }),
      );
    },
    lyrics: () =>
      Promise.resolve({
        title: options.lyrics === 'sure' ? '晴天' : '',
        sure: options.lyrics === 'sure',
        artist: options.lyrics === 'sure' ? '周杰伦' : undefined,
        candidates: [],
        why: 'test',
        queries: ['a', 'b'],
        ms: 300,
      }),
    found: ({ title }) => `这首是《${title}》`,
    early: { minChars: options.minChars ?? 5, noLyrics: () => '没听到', tooEarly: () => '太早' },
    onTold: (song) => void intros.push(song.title),
    log: silentLog,
    now: () => now,
  });
  const tool = identifySongTool({
    songId,
    room: fakeRoom({ transcript, now: () => now }),
    maxLength: 49,
    log: silentLog,
  });
  return { tool, songId, intros, asked, tick: (ms: number) => (now += ms) };
}

const answer = async (tool: ReturnType<typeof setup>['tool'], args = {}) =>
  JSON.parse((await tool.call(args, context)).text) as Record<string, unknown>;

test('names the song from the lyrics search without Codex, and does not start an intro', async () => {
  const { tool, songId, intros, asked } = setup({ lyrics: 'sure' });
  expect(await answer(tool)).toMatchObject({
    found: true,
    title: '晴天',
    sure: true,
    by: 'lyrics-search',
  });
  expect(asked).toEqual([]);
  // Remembered as told (so /自动识歌 stays quiet), but Claude's reply is the intro.
  expect(songId.namedAt('晴天')).toBeDefined();
  expect(intros).toEqual([]);
});

test('falls back to Codex, with the hint as the question', async () => {
  const { tool, asked } = setup({ lyrics: 'unsure' });
  expect(await answer(tool, { hint: '是周杰伦的吗' })).toMatchObject({
    found: true,
    artist: '周杰伦',
    by: 'codex',
  });
  expect(asked).toEqual(['问：是周杰伦的吗']);
});

test('says so when too little is sung, without asking anyone', async () => {
  const { tool, asked } = setup({ lyrics: 'sure', minChars: 500 });
  expect(await answer(tool)).toMatchObject({ found: false, note: '太早' });
  expect(asked).toEqual([]);
});

test('tells which song the room was last told, and how long ago', async () => {
  const { tool, tick } = setup({ lyrics: 'sure' });
  expect((await answer(tool)).lastTold).toBeUndefined();
  tick(3 * 60_000);
  expect((await answer(tool)).lastTold).toEqual({ title: '晴天', artist: '周杰伦', minutesAgo: 3 });
});

test('/识歌 passes its text as the hint, says the program’s sentence, and starts the intro', async () => {
  const { tool, intros } = setup({ lyrics: 'sure' });
  const [command] = tool.commands!;
  expect(command!.name).toBe('识歌');
  expect(command!.parse('日文的')).toEqual({ args: { hint: '日文的' } });
  expect(command!.parse('')).toEqual({ args: {} });

  const result = await tool.call({}, { ...context, direct: true });
  expect(JSON.parse(result.text)).toMatchObject({ found: true, message: '这首是《晴天》' });
  expect(command!.say(result, {})).toBe('这首是《晴天》');
  expect(intros).toEqual(['晴天']);
});

test('what /识歌 says when too little is sung is the early wording', async () => {
  const { tool } = setup({ lyrics: 'sure', minChars: 500 });
  const result = await tool.call({}, { ...context, direct: true });
  expect(tool.commands![0]!.say(result, {})).toBe('太早');
});

test('listens for 「这是什么歌」 in its forms, and not for asking what the streamer can sing', () => {
  const { listen } = setup().tool;
  expect(listen?.when.startsWith('在问现在正在唱的')).toBe(true);
  for (const said of ['这是什么歌', 'bgm是什么', '求歌名'])
    expect(listen?.trigger?.test(said)).toBe(true);
  // The trigger's look-behinds keep 「会唱什么歌」 and 「点什么歌」 out.
  for (const said of ['会唱什么歌', '点什么歌']) expect(listen?.trigger?.test(said)).toBe(false);
});
