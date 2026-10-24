import { SongEnds } from '../../../src/app/songs/song-ends';
import type { ChatRecord } from '../../../src/core/chat/chat-record';
import type { SongSpan } from '../../../src/core/songs/song-breaks';
import { Transcript, type TranscriptLine } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';

const at = Date.UTC(2026, 9, 22, 2, 0, 0);

/** A room where the bot told `told` (at `told.at` s), and the song break sources say `spans`. */
function setup(told?: { title: string; at: number }, spans: SongSpan[] = []) {
  let now = at;
  const transcript = new Transcript(Infinity, () => now);
  const records: ChatRecord[] = [];
  const room = fakeRoom({ transcript, now: () => now });
  const songEnds = new SongEnds({
    room: { recentTranscript: () => room.recentTranscript(), songSpans: () => spans },
    record: { add: (record) => records.push(record) },
    lastTold: () => told && { song: { title: told.title }, at: at + told.at * 1000 },
    timeZone: () => 'Asia/Shanghai',
  });
  /** The streamer sings (or says) `text`, ending at `s` seconds. */
  const line = (s: number, text: string, sung = true) => {
    now = at + s * 1000;
    const heard: TranscriptLine = { start: now - 3000, end: now, text, speech: sung ? 0.05 : 0.8 };
    transcript.add(heard);
    songEnds.hear(heard);
  };
  const ended = () => records.map((record) => ('text' in record ? record.text : ''));
  return { line, ended, records };
}

test('writes the song that ended once the next one starts, named when the bot told it', () => {
  const { line, ended, records } = setup({ title: '璀璨冒险人', at: 40 });
  for (let s = 10; s < 100; s += 10) line(s, `第一首${s}`);
  expect(ended()).toEqual([]);
  // A pause of over a minute, then the next song.
  for (let s = 200; s < 240; s += 10) line(s, `第二首${s}`);
  expect(ended()).toEqual(['《璀璨冒险人》唱完了，下一首从 10:03:17 开始（停顿或说话）']);
  expect(records[0]).toMatchObject({ type: 'song', sender: '主播' });
  // Once a song, however long it goes on.
  for (let s = 240; s < 300; s += 10) line(s, `第二首${s}`);
  expect(ended()).toHaveLength(1);
});

test('an unnamed song ended, told apart by a song break source', () => {
  const spans: SongSpan[] = [];
  const { line, ended } = setup(undefined, spans);
  for (let s = 10; s < 70; s += 10) line(s, `歌词${s}`);
  // Sung straight on, no pause: the lyrics source says a new song started with this line.
  spans.push({ from: at + 67_000, to: at + 67_000, kind: 'break', by: 'lyrics' });
  for (let s = 70; s < 120; s += 10) line(s, `别的歌${s}`);
  expect(ended()).toEqual(['一首歌唱完了，下一首从 10:01:07 开始（歌词对不上了）']);
});

test('a song the lyrics tell apart a few lines in still ends, from its first line', () => {
  // As 喜欢你 → 爱的可能: the lyrics' third miss came 3 lines into the next song.
  const spans: SongSpan[] = [];
  const { line, ended } = setup({ title: '喜欢你', at: 30 }, spans);
  for (let s = 10; s < 70; s += 10) line(s, `喜欢你${s}`);
  for (let s = 70; s < 100; s += 10) line(s, `爱的可能${s}`);
  expect(ended()).toEqual([]);
  spans.push({ from: at + 67_000, to: at + 67_000, kind: 'break', by: 'lyrics' });
  line(100, '爱的可能100');
  expect(ended()).toEqual(['《喜欢你》唱完了，下一首从 10:01:07 开始（歌词对不上了）']);
  // Once: the lines after are that song's.
  for (let s = 110; s < 400; s += 10) line(s, `爱的可能${s}`);
  expect(ended()).toHaveLength(1);
});

test('talk, or a guest singing, ends no song', () => {
  const { line, ended } = setup();
  for (let s = 10; s < 60; s += 10) line(s, `说话${s}`, false);
  for (let s = 100; s < 160; s += 10) line(s, `歌词${s}`);
  expect(ended()).toEqual([]);
});
