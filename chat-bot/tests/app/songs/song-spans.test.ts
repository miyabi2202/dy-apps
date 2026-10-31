import { SongSpans } from '../../../src/app/songs/song-spans';
import type { SongBreakSource } from '../../../src/core/songs/song-breaks';

const source = (name: string, at: number): SongBreakSource => ({
  name,
  spans: () => [{ from: at, to: at, kind: 'break', by: name }],
});

test('combines what the sources make of the lines, and has none without sources', () => {
  expect(new SongSpans({ sources: [] }).of([])).toEqual([]);
  const spans = new SongSpans({ sources: [source('lyrics', 1000), source('shazam', 2000)] }).of([]);
  expect(spans.map((span) => span.by).sort()).toEqual(['lyrics', 'shazam']);
});

test('leaves out the sources the room does not list, read each time', () => {
  let on: string[] | undefined = ['shazam'];
  const spans = new SongSpans({
    sources: [source('lyrics', 1000), source('shazam', 2000)],
    on: () => on,
  });
  expect(spans.of([]).map((span) => span.by)).toEqual(['shazam']);
  on = undefined;
  expect(spans.of([])).toHaveLength(2);
});
