import type { Log } from '../../../src/app/ports';
import { ShazamBreaks } from '../../../src/app/songs/shazam-breaks';
import type { SongBreakSource } from '../../../src/core/songs/song-breaks';
import { currentSong, type TranscriptLine } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';

const sung = (at: number, title?: string): TranscriptLine => ({
  start: (at - 3) * 1000,
  end: at * 1000,
  text: `唱${at}`,
  speech: 0.05,
  ...(title && { backing: { title, artist: '', at: at * 1000 } }),
});
const said = (at: number): TranscriptLine => ({ ...sung(at), text: `说${at}`, speech: 0.9 });

function setup() {
  const logged: [string, object | undefined][] = [];
  const log: Log = { debug() {}, info: (m, meta) => logged.push([m, meta]), warn() {}, error() {} };
  return { breaks: new ShazamBreaks({ log }), logged };
}

test('logs each new song once, however often it is asked', () => {
  const { breaks, logged } = setup();
  const lines = [sung(10, '年轮说'), sung(30, '年轮说')];
  breaks.spans(lines);
  breaks.spans(lines);
  breaks.spans([...lines, sung(50, '年轮说')]);
  expect(logged).toEqual([['song changed', { by: 'shazam', title: '年轮说', at: 7000 }]]);
  // The spans carry no title: just what song-breaks.ts reads.
  expect(breaks.spans(lines)).toEqual([
    { from: 7000, to: 7000, kind: 'break', by: 'shazam' },
    { from: 7000, to: 30_000, kind: 'same', by: 'shazam' },
  ]);
});

test("ranks below the lyrics, above the pauses, and is off when the room's songBreaks leaves it out", () => {
  const lines = [sung(10, '年轮说'), sung(30, '年轮说'), said(40), said(50), sung(80, '年轮说')];
  const lyrics: SongBreakSource = {
    name: 'lyrics',
    spans: () => [{ from: 77_000, to: 77_000, kind: 'break', by: 'lyrics' }],
  };
  const room = fakeRoom();
  room.addSongBreaks(lyrics);
  room.addSongBreaks(setup().breaks);
  expect(currentSong(lines, { spans: room.songSpans(lines) })[0]?.text).toBe('唱80');

  const withoutLyrics = fakeRoom({ songBreaks: () => ['shazam'] });
  withoutLyrics.addSongBreaks(lyrics);
  withoutLyrics.addSongBreaks(setup().breaks);
  expect(currentSong(lines, { spans: withoutLyrics.songSpans(lines) })[0]?.text).toBe('唱10');

  const off = fakeRoom({ songBreaks: () => ['lyrics'] });
  off.addSongBreaks(setup().breaks);
  expect(off.songSpans(lines)).toEqual([]);
  expect(currentSong(lines, { spans: off.songSpans(lines) })[0]?.text).toBe('唱80');
});
