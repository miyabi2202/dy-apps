import {
  backingGapSpans,
  parseBackingLevel,
  type BackingLevel,
} from '../../../src/core/songs/backing-gaps';
import { combineSpans } from '../../../src/core/songs/song-breaks';
import { currentSong, type TranscriptLine } from '../../../src/core/songs/transcript';

const sung = (at: number): TranscriptLine => ({
  start: (at - 3) * 1000,
  end: at * 1000,
  text: `唱${at}`,
  speech: 0.05,
});
const said = (at: number): TranscriptLine => ({ ...sung(at), text: `说${at}`, speech: 0.9 });

/** The backing measured from 0 to `seconds` in blocks of 15 s, at `db`, quiet (60 dB lower) in `quiet`. */
function levels(seconds: number, db: number, quiet: [number, number][] = []): BackingLevel[] {
  const out: BackingLevel[] = [];
  for (let from = 0; from < seconds; from += 15) {
    out.push({
      from: from * 1000,
      to: (from + 15) * 1000,
      db: Array.from({ length: 15 }, (_, i) =>
        quiet.some(([a, b]) => from + i >= a && from + i < b) ? db - 60 : db,
      ),
    });
  }
  return out;
}

test("reads the worker's backing levels", () => {
  const text = JSON.stringify({ backing_level: { from: 100, to: 115.5, db: [-26.1, -80] } });
  expect(parseBackingLevel(text)).toEqual({ from: 100_000, to: 115_500, db: [-26.1, -80] });
  expect(parseBackingLevel(JSON.stringify({ start: 1, end: 2, text: 'backing_level' }))).toBeNull();
  expect(parseBackingLevel('{"backing_level": {"from": 1}}')).toBeNull();
});

test('the backing stopping between two sung lines is a break; playing on through talk, one song', () => {
  const lines = [
    sung(20),
    sung(30),
    said(40),
    said(50),
    said(60),
    sung(70),
    sung(80),
    sung(110),
    sung(120),
  ];
  const spans = backingGapSpans(lines, levels(150, -26, [[90, 100]]));
  expect(spans).toEqual([
    { from: 17_000, to: 80_000, kind: 'same', by: 'backingGaps' },
    { from: 107_000, to: 107_000, kind: 'break', by: 'backingGaps', quietMs: 10_000 },
    { from: 107_000, to: 120_000, kind: 'same', by: 'backingGaps' },
  ]);
  // The talk and the pause of 40 s alone would have started a song at 67 s.
  expect(currentSong(lines)[0]?.text).toBe('唱70');
  expect(currentSong(lines, { spans: combineSpans([spans]) })[0]?.text).toBe('唱110');
});

test("quiet is measured against the backing's own level, not a fixed one", () => {
  const lines = [sung(20), sung(30), sung(80), sung(110)];
  for (const db of [-10, -45]) {
    const breaks = backingGapSpans(lines, levels(150, db, [[90, 95]])).filter(
      (s) => s.kind === 'break',
    );
    expect(breaks.map((s) => s.from)).toEqual([107_000]);
  }
  // Under 3 s isn't a gap.
  expect(
    backingGapSpans(lines, levels(150, -26, [[90, 92]])).filter((s) => s.kind === 'break'),
  ).toEqual([]);
});

test('says nothing where the backing was not measured', () => {
  const lines = [sung(20), sung(30), said(40), said(50), sung(70)];
  expect(backingGapSpans(lines, [])).toEqual([]);
  // Measured only up to 45 s: the stretch to 67 s isn't known to be one song.
  expect(backingGapSpans(lines, levels(45, -26))).toEqual([
    { from: 17_000, to: 30_000, kind: 'same', by: 'backingGaps' },
  ]);
});
