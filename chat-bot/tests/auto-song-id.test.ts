import { AutoSongId } from '../src/app/auto-song-id';
import type { SongAnswer } from '../src/core/song-answer';
import { Transcript, type TranscriptLine } from '../src/core/transcript';
import { fakeRoom } from './fake-room';
import { silentLog } from './fakes';

/**
 * Auto song id over a room whose streamer says or sings a line every `step` seconds; `answers`
 * are the model's, one per try.
 */
function setup(answers: (Partial<SongAnswer> | null)[], on = true) {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const sent: string[] = [];
  const prompts: string[] = [];
  const named = new Map<string, number>();
  let last: { song: SongAnswer; at: number } | undefined;
  const auto = new AutoSongId({
    songId: {
      prompt: () => '{{question}}|{{transcript}}',
      name: ({ prompt }) => {
        prompts.push(prompt);
        const answer = answers.shift();
        return Promise.resolve({
          answer: answer ? { message: '', title: '', artist: '', sure: true, ...answer } : null,
          text: '',
        });
      },
      namedAt: (title) => named.get(title),
      lastTold: () => last,
      told: (song) => {
        named.set(song.title, now);
        last = { song, at: now };
      },
    },
    room: fakeRoom({ transcript, now: () => now }),
    outbox: { push: ({ text }) => sent.push(text) },
    log: silentLog,
    on,
  });
  /** The streamer sings (or says) `text` at `at` seconds. */
  const line = async (at: number, text: string, sung = true) => {
    now = at * 1000;
    const heard: TranscriptLine = { start: now - 3000, end: now, text, speech: sung ? 0.05 : 0.8 };
    transcript.add(heard);
    auto.hear(heard);
    await auto.idle();
  };
  return { auto, line, sent, prompts };
}

test('names the song once the streamer has sung it a while, and says only what it is sure of', async () => {
  const { line, sent, prompts } = setup([
    { message: '这首是周杰伦的《晴天》～', title: '晴天', artist: '周杰伦' },
    { message: '这段没认出来', title: '' },
  ]);
  // Talk with a line taken for sung now and then: not singing.
  for (let t = 0; t < 60; t += 10) await line(t, `说话${t}`, t % 30 === 0);
  for (let t = 100; t < 150; t += 10) await line(t, `刮风这天我试过握着你手${t}`);
  expect(sent).toEqual(['这首是周杰伦的《晴天》～']);
  expect(prompts[0]).toMatch(/^没人问，是你听到主播在唱歌/);
  // A pause, then a song it can't name: nothing said.
  for (let t = 300; t < 350; t += 10) await line(t, `另一首歌听不出来是哪首${t}`);
  expect(prompts).toHaveLength(2);
  expect(sent).toEqual(['这首是周杰伦的《晴天》～']);
});

test('names it again every 3 minutes of singing on, but never says the same song twice in an hour', async () => {
  const sunny = { message: '这首是《晴天》', title: '晴天' };
  const { line, sent, prompts } = setup([
    sunny,
    sunny,
    { message: '这首是《七里香》', title: '七里香' },
  ]);
  // Seven minutes of singing without a pause.
  for (let t = 0; t <= 420; t += 10) await line(t, `歌词${t}`);

  expect(prompts).toHaveLength(3);
  expect(sent).toEqual(['这首是《晴天》', '这首是《七里香》']);
  // Asked again, it's told what it named last, so the model can tell it's still that song.
  expect(prompts[0]).not.toMatch(/已经说过/);
  expect(prompts[1]).toMatch(/你 3 分钟前已经说过这首是《晴天》。.*除非|只有上次说错了/);
});

test('/自动识歌 turns it on and off; off, it names nothing', async () => {
  const { auto, line, prompts } = setup([{ message: '这首是《晴天》', title: '晴天' }], false);
  for (let t = 0; t < 60; t += 10) await line(t, `一句长长的歌词${t}`);
  expect(prompts).toEqual([]);

  const run = (args: string) => auto.commands()[0]?.run?.(args);
  expect(run('开')).toEqual({ ok: false, reply: '要写 0（关闭）或 1（打开），用法：/自动识歌 1' });
  expect(run('1')).toEqual({ ok: true, reply: '已处理自动识歌请求' });
  await line(60, '一句长长的歌词60');
  expect(prompts).toHaveLength(1);
});

test('a guess it is not sure of is not said', async () => {
  const { line, sent, prompts } = setup([
    { message: '听着像《刀剑如梦》，不太确定？', title: '刀剑如梦', sure: false },
  ]);
  for (let t = 100; t < 150; t += 10) await line(t, `谁敢闯望不见的人间${t}`);

  expect(prompts).toHaveLength(1);
  expect(sent).toEqual([]);
});

test('finding the song it named still being sung, it looks again after a minute', async () => {
  const sunny = { message: '这首是《晴天》', title: '晴天' };
  const { line, sent, prompts } = setup([
    sunny,
    { message: '', title: '晴天（Live）' },
    { message: '这首是《七里香》', title: '七里香' },
  ]);
  for (let t = 0; t <= 300; t += 10) await line(t, `一句长长的歌词${t}`);

  expect(prompts).toHaveLength(3);
  expect(sent).toEqual(['这首是《晴天》', '这首是《七里香》']);
});

test('not sure, it asks again about the same song once twice the lyrics are in, twice at most', async () => {
  const unsure = { message: '', title: '', sure: false };
  const { line, sent, prompts } = setup([
    unsure,
    unsure,
    { message: '这首是《晴天》', title: '晴天' },
    unsure,
  ]);
  // About 13 characters a line: asked at 4 lines, again at 8, and again at 16; then no more.
  for (let t = 0; t <= 300; t += 10) await line(t, `刮风这天我试过握着你手${t}`);
  expect(prompts).toHaveLength(3);
  expect(sent).toEqual(['这首是《晴天》']);
});

test('a new song after talking is asked about on its own, not as a retry of the last', async () => {
  const unsure = { message: '', title: '', sure: false };
  const { line, sent, prompts } = setup([unsure, { message: '这首是《七里香》', title: '七里香' }]);
  for (let t = 0; t <= 30; t += 10) await line(t, `刮风这天我试过握着你手${t}`);
  expect(prompts).toHaveLength(1);
  await line(40, '谢谢大家的礼物', false);
  await line(48, '下一首送给你们', false);
  // Singing again, for long enough that the talk is out of the last minute.
  for (let t = 60; t <= 120; t += 10) await line(t, `窗外的麻雀在电线杆上多嘴${t}`);
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('窗外的麻雀');
  expect(prompts[1]).not.toContain('刮风这天');
  expect(sent).toEqual(['这首是《七里香》']);
});
