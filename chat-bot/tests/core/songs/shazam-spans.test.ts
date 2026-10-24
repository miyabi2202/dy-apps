import { shazamSpans } from '../../../src/core/songs/shazam-spans';
import { combineSpans } from '../../../src/core/songs/song-breaks';
import { currentSong, type TranscriptLine } from '../../../src/core/songs/transcript';

/** A line sung from `at` - 3 s to `at` (seconds), over `title` as a lookup at `lookup` named it. */
function sung(at: number, title?: string, lookup = at): TranscriptLine {
  return {
    start: (at - 3) * 1000,
    end: at * 1000,
    text: `唱${at}`,
    speech: 0.05,
    ...(title && { backing: { title, artist: '', at: lookup * 1000 } }),
  };
}

const said = (at: number): TranscriptLine => ({ ...sung(at), text: `说${at}`, speech: 0.9 });

test('a title named twice starts a song where the singing paused, and holds it as one song', () => {
  const lines = [
    sung(10, '璀璨冒险人', 10),
    sung(15, '璀璨冒险人', 10),
    sung(30, '璀璨冒险人 (和声伴奏)', 30), // its version tag aside, the same song
    sung(50),
    sung(60, '璀璨冒险人', 55),
    sung(100),
    sung(105),
    sung(112, '最熟悉的陌生人', 112),
    sung(130, '最熟悉的陌生人', 130),
  ];
  expect(shazamSpans(lines)).toEqual([
    { from: 7000, to: 7000, kind: 'break', by: 'shazam', title: '璀璨冒险人' },
    { from: 7000, to: 60_000, kind: 'same', by: 'shazam' },
    // Since 35 s before its first lookup, the longest pause was before the line at 100 s.
    { from: 97_000, to: 97_000, kind: 'break', by: 'shazam', title: '最熟悉的陌生人' },
    { from: 109_000, to: 130_000, kind: 'same', by: 'shazam' },
  ]);
});

test('a title named once, or no title, says nothing', () => {
  // Two lines, one lookup.
  const once = [sung(10, 'Magic Carillon', 10), sung(15, 'Magic Carillon', 10), sung(20)];
  expect(shazamSpans(once)).toEqual([]);
  expect(shazamSpans([sung(10), sung(20), said(25)])).toEqual([]);
});

test("a recording playing isn't her singing", () => {
  const played = (at: number, lookup: number): TranscriptLine => ({
    ...sung(at, 'Sign', lookup),
    played: { title: 'Sign', artist: 'Aya Uchida' },
  });
  expect(shazamSpans([played(10, 10), played(30, 30)])).toEqual([]);
});

test('talk over the backing playing on is no break, while its title holds', () => {
  const lines = [
    sung(10, '年轮说', 10),
    sung(30, '年轮说', 30),
    said(40),
    said(50),
    said(60),
    sung(80, '年轮说', 80),
  ];
  const spans = combineSpans([shazamSpans(lines)]);
  // Without it the talk and a pause of 50 s would have started a new song at 77 s.
  expect(currentSong(lines)[0]?.text).toBe('唱80');
  expect(currentSong(lines, { spans })[0]?.text).toBe('唱10');
});
