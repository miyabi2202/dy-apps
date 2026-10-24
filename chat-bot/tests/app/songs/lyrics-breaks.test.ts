import { LyricsBreaks } from '../../../src/app/songs/lyrics-breaks';
import type { Log } from '../../../src/app/ports';
import { singingSong, Transcript, type TranscriptLine } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';

/** The start of 《画廊游记》 as NetEase has it. */
const 画廊游记 = [
  '在一切开始的时分',
  '我推开了画廊的门',
  '捧着空白灵魂 迈步向画卷缤纷',
  '走过跃然纸上的晨昏',
  '七情六欲被轻轻一吻',
  '才唤醒了心神 让我能与自己相认',
  '一帧帧 时光在我面前被逐一定格',
  '望着满墙画作',
  '这双眼看到了什么',
];

/** The start of 《靠近》, sung after it. */
const 靠近 = [
  '海风吹过的夏天仿佛从来我都在你身上',
  '晚安前想念怎么那么厉害闭上双眼梦里的相见',
  '看见我孩子般微笑的脸再靠近一点幸福无限蔓延',
  '心开始悄悄在改变我是否用心发现',
];

function setup(lyrics: Record<string, string[]> = { 画廊游记 }) {
  const logged: [string, object | undefined][] = [];
  const log: Log = {
    debug() {},
    info: (message, meta) => logged.push([message, meta]),
    warn: (message, meta) => logged.push([message, meta]),
    error() {},
  };
  const asked: string[] = [];
  const breaks = new LyricsBreaks({
    fetchLyrics: (title, artist) => {
      asked.push(`${title}/${artist}`);
      return Promise.resolve(lyrics[title] ?? []);
    },
    log,
  });
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const room = fakeRoom({ transcript, now: () => now });
  room.addSongBreaks(breaks);
  /** The streamer sings (or says) `text` at `at` seconds. */
  const heard = (at: number, text: string, sung = true): TranscriptLine => {
    now = at * 1000;
    const line: TranscriptLine = { start: now - 3000, end: now, text, speech: sung ? 0.05 : 0.8 };
    transcript.add(line);
    return line;
  };
  return { breaks, room, heard, logged, asked };
}

test('says nothing before a song is named, nor until its lyrics came', async () => {
  const { breaks, heard, room, asked } = setup();
  const lines = [heard(10, '在一切开始的时分我推开了花廊的门')];
  expect(breaks.spans(lines)).toEqual([]);
  breaks.keep({ title: '画廊游记', artist: '黄诗扶' }, 0);
  expect(asked).toEqual(['画廊游记/黄诗扶']);
  expect(breaks.spans(lines)).toEqual([]);
  await breaks.settled();
  expect(room.songSpans(lines)).toEqual([{ from: 0, to: 10_000, kind: 'same', by: 'lyrics' }]);
});

test("breaks where the lyrics stop matching, logging it once with what it can't match", async () => {
  const { breaks, heard, logged } = setup();
  breaks.keep({ title: '画廊游记', artist: '黄诗扶' }, 5_000);
  await breaks.settled();
  const lines = [
    heard(10, '在一切开始的时分我推开了花廊的门'),
    ...靠近.map((text, i) => heard(20 + 10 * i, text)),
  ];
  const first = lines[1]!;
  const expected = [
    { from: 5_000, to: first.start - 1, kind: 'same', by: 'lyrics' },
    { from: first.start, to: first.start, kind: 'break', by: 'lyrics' },
  ];
  expect(breaks.spans(lines)).toEqual(expected);
  expect(breaks.spans(lines)).toEqual(expected);
  expect(logged.filter(([message]) => message === 'song changed')).toEqual([
    [
      'song changed',
      { by: 'lyrics', from: '画廊游记', line: first.text, at: first.start, misses: 3 },
    ],
  ]);
});

test('the same song named again moves when its lyrics are checked from; another replaces it', async () => {
  const { breaks, heard, asked } = setup({ 画廊游记, 靠近 });
  breaks.keep({ title: '画廊游记', artist: '' }, 0);
  await breaks.settled();
  const lines = 靠近.map((text, i) => heard(10 + 10 * i, text));
  expect(breaks.spans(lines).some((span) => span.kind === 'break')).toBe(true);
  // Named again after those lines: they were it after all (as far as the naming goes).
  breaks.keep({ title: '畫廊遊記', artist: '' }, 60_000);
  expect(breaks.spans(lines)).toEqual([]);
  breaks.keep({ title: '靠近', artist: '' }, 60_000);
  await breaks.settled();
  expect(asked).toEqual(['画廊游记/', '靠近/']);
});

test('without lyrics, logs so and says nothing: pauses and talk decide as before', async () => {
  const { breaks, heard, logged } = setup({});
  breaks.keep({ title: '纯音乐', artist: '' }, 0);
  await breaks.settled();
  expect(breaks.spans([heard(10, '啦啦啦啦啦啦啦啦啦啦')])).toEqual([]);
  expect(logged.map(([message]) => message)).toEqual(['no lyrics for']);
});

describe('in the room', () => {
  /** She sings 4 lines of 《画廊游记》, talks for a minute and a half, and sings on. */
  function sing(room: ReturnType<typeof setup>) {
    const { heard } = room;
    const first = 画廊游记.slice(0, 4).map((text, i) => heard(10 + 5 * i, `${text}${text}`));
    heard(40, '谢谢大家的灯牌欢迎新来的宝宝', false);
    heard(60, '大家有什么想听的歌吗可以点一下', false);
    const after = 画廊游记.slice(4).map((text, i) => heard(130 + 5 * i, `${text}${text}`));
    return [...first, ...after];
  }

  it('keeps a song its lyrics know as one, through a pause with talk', async () => {
    const setUp = setup();
    setUp.breaks.keep({ title: '画廊游记', artist: '' }, 20_000);
    await setUp.breaks.settled();
    const sung = sing(setUp);
    const { room } = setUp;
    const transcript = room.recentTranscript();
    const song = singingSong(transcript, sung.at(-1)!, room.songSpans(transcript));
    expect(song?.start).toBe(sung[0]!.start);
  });

  it('splits it at the pause as before without the lyrics', () => {
    const setUp = setup();
    const sung = sing(setUp);
    const transcript = setUp.room.recentTranscript();
    const song = singingSong(transcript, sung.at(-1)!, setUp.room.songSpans(transcript));
    expect(song?.start).toBe(sung[4]!.start);
  });

  it("leaves a source the room's songBreaks doesn't list out", async () => {
    const breaks = new LyricsBreaks({
      fetchLyrics: () => Promise.resolve(画廊游记),
      log: { debug() {}, info() {}, warn() {}, error() {} },
    });
    const room = fakeRoom({ songBreaks: () => [] });
    room.addSongBreaks(breaks);
    breaks.keep({ title: '画廊游记', artist: '' }, 0);
    await breaks.settled();
    const line: TranscriptLine = { start: 1000, end: 5000, text: '在一切开始的时分', speech: 0.05 };
    expect(breaks.spans([line])).not.toEqual([]);
    expect(room.songSpans([line])).toEqual([]);
  });
});
