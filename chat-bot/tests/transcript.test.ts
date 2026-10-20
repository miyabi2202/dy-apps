import {
  isHandled,
  parseStatusLine,
  singingSong,
  type TranscriptLine,
} from '../src/core/transcript';

/** A line ending at `end` seconds, sung or spoken. */
const line = (end: number, sung = true, host?: boolean): TranscriptLine => ({
  start: (end - 3) * 1000,
  end: end * 1000,
  text: `at ${end}`,
  speech: sung ? 0.05 : 0.8,
  ...(host !== undefined && { host }),
});

test('a song is the sung lines since the last pause, once at least 3 of the last minute are sung', () => {
  const lines = [line(10), line(14), line(18), line(22)];
  const song = singingSong(lines, lines[3]!);
  expect(song?.lines).toEqual(lines);
  expect(song?.start).toBe(7000);

  // Too few sung lines yet, a spoken line, and a guest's sung one are no song.
  expect(singingSong(lines.slice(0, 2), lines[1]!)).toBeNull();
  expect(singingSong([...lines, line(26, false)], line(26, false))).toBeNull();
  expect(singingSong([...lines, line(26, true, false)], line(26, true, false))).toBeNull();
});

test('a song after a long pause starts a new one, and the same one counts again after a while', () => {
  const first = [line(10), line(14), line(18)];
  const second = [...first, line(200), line(204), line(208)];
  const song = singingSong(second, second[5]!);
  expect(song?.start).toBe(197_000);
  // Handled once, at 20 s: a song that started after that is a new one.
  expect(isHandled({ lines: [], start: 7000 }, 20_000, 24_000, 180_000)).toBe(true);
  expect(isHandled(song!, 20_000, 208_000, 180_000)).toBe(false);
  // The same song again after `againMs` of singing on.
  expect(isHandled({ lines: [], start: 7000 }, 20_000, 201_000, 180_000)).toBe(false);
});

test('reads the worker status lines, and nothing else', () => {
  expect(parseStatusLine('{"ready": true}')).toBe('ready');
  expect(parseStatusLine('{"stream_ended": true, "reason": "eof"}')).toBe('stream_ended');
  expect(parseStatusLine('{"text": "你好"}')).toBeNull();
  expect(parseStatusLine('loading models')).toBeNull();
  expect(parseStatusLine('{not json')).toBeNull();
});
