import {
  combineSpans,
  isOneSong,
  lastBreak,
  type SongSpan,
} from '../../../src/core/songs/song-breaks';
import { currentSong, singingSong, type TranscriptLine } from '../../../src/core/songs/transcript';

const same = (from: number, to: number, by = 'a'): SongSpan => ({ from, to, kind: 'same', by });
const brk = (at: number, by = 'a'): SongSpan => ({ from: at, to: at, kind: 'break', by });

describe('combineSpans', () => {
  it("drops a source's break that a higher-ranked source's same span covers", () => {
    const lyrics = [same(100, 500, 'lyrics')];
    const novelty = [brk(300, 'novelty'), brk(600, 'novelty')];
    expect(combineSpans([lyrics, novelty])).toEqual([
      same(100, 500, 'lyrics'),
      brk(600, 'novelty'),
    ]);
  });

  it("keeps a higher-ranked source's break inside a lower one's same span", () => {
    const lyrics = [brk(300, 'lyrics')];
    const shazam = [same(100, 500, 'shazam')];
    expect(combineSpans([lyrics, shazam])).toEqual([brk(300, 'lyrics'), same(100, 500, 'shazam')]);
  });

  it('counts a break at the start of a same span: the song starts there', () => {
    expect(combineSpans([[same(100, 500)], [brk(100, 'b')]])).toEqual([
      same(100, 500),
      brk(100, 'b'),
    ]);
  });

  it('is empty without sources', () => {
    expect(combineSpans([])).toEqual([]);
  });
});

test('isOneSong and lastBreak read the combined spans', () => {
  const spans = [same(100, 500), brk(50), brk(700)];
  expect(isOneSong(spans, 300)).toBe(true);
  expect(isOneSong(spans, 100)).toBe(false);
  expect(isOneSong(spans, 600)).toBe(false);
  expect(lastBreak(spans)).toEqual(brk(700));
  expect(lastBreak([same(1, 2)])).toBeUndefined();
});

describe('currentSong with spans', () => {
  /** A line ending at `end` seconds, sung or spoken. */
  const line = (end: number, sung = true): TranscriptLine => ({
    start: (end - 3) * 1000,
    end: end * 1000,
    text: `at ${end}`,
    speech: sung ? 0.05 : 0.8,
  });
  // A pause of 2 minutes between 30 and 150: a new song by pauses alone.
  const lines = [line(10), line(20), line(30), line(150), line(160)];

  it('is as before without spans', () => {
    expect(currentSong(lines)).toEqual(lines.slice(3));
    expect(currentSong(lines, { spans: [] })).toEqual(lines.slice(3));
  });

  it("doesn't break at a pause inside a source's same span", () => {
    expect(currentSong(lines, { spans: [same(15_000, 160_000)] })).toEqual(lines);
  });

  it("starts the song at a source's break, or at a later pause", () => {
    expect(currentSong(lines, { spans: [same(0, 160_000), brk(17_000)] })).toEqual(lines.slice(1));
    // The pause after the source's break ends that song too.
    expect(currentSong(lines, { spans: [brk(17_000)] })).toEqual(lines.slice(3));
  });

  it('passes them on from singingSong', () => {
    const now = lines.at(-1)!;
    const singing = [line(130), line(140), ...lines.slice(3)];
    const all = [...lines.slice(0, 3), ...singing];
    expect(singingSong(all, now)?.lines).toEqual(singing);
    expect(singingSong(all, now, [same(15_000, 160_000)])?.lines).toEqual(all);
  });
});
