import type { Log } from '../../../src/app/ports';
import { BackingGapBreaks } from '../../../src/app/songs/backing-gap-breaks';
import type { TranscriptLine } from '../../../src/core/songs/transcript';

const sung = (at: number): TranscriptLine => ({
  start: (at - 3) * 1000,
  end: at * 1000,
  text: `唱${at}`,
  speech: 0.05,
});

/** 15 s of backing from `from` (s), at -26 dB, quiet (-80) in the seconds `quiet` lists. */
const block = (from: number, quiet: number[] = []) => ({
  from: from * 1000,
  to: (from + 15) * 1000,
  db: Array.from({ length: 15 }, (_, i) => (quiet.includes(from + i) ? -80 : -26)),
});

function setup() {
  const logged: [string, object | undefined][] = [];
  const log: Log = { debug() {}, info: (m, meta) => logged.push([m, meta]), warn() {}, error() {} };
  let now = 0;
  const breaks = new BackingGapBreaks({ log, now: () => now, keepMs: 60_000 });
  return { breaks, logged, setNow: (s: number) => (now = s * 1000) };
}

test('says nothing until the worker sent backing levels; then breaks where the backing stopped, logged once', () => {
  const { breaks, logged, setNow } = setup();
  const lines = [sung(20), sung(40), sung(64)];
  expect(breaks.spans(lines)).toEqual([]);
  for (const from of [0, 15, 30, 45]) breaks.add(block(from, [50, 51, 52, 53]));
  setNow(60);
  expect(breaks.spans(lines)).toEqual([
    { from: 17_000, to: 40_000, kind: 'same', by: 'backingGaps' },
    { from: 61_000, to: 61_000, kind: 'break', by: 'backingGaps' },
  ]);
  breaks.spans(lines);
  expect(logged).toEqual([
    ['song changed', { by: 'backingGaps', at: 61_000, quietMs: 4000, line: '唱64' }],
  ]);
});

test('forgets levels older than keepMs', () => {
  const { breaks, setNow } = setup();
  breaks.add(block(0));
  setNow(200);
  breaks.add(block(180));
  expect(breaks.spans([sung(5), sung(12)])).toEqual([]);
});
