import {
  currentSong,
  isHandled,
  isSung,
  parseStatusLine,
  parseWorkerLine,
  singingSong,
  type TranscriptLine,
} from '../../../src/core/songs/transcript';

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

  // Too few sung lines yet, a spoken line, and a guest's spoken one are no song.
  expect(singingSong(lines.slice(0, 2), lines[1]!)).toBeNull();
  expect(singingSong([...lines, line(26, false)], line(26, false))).toBeNull();
  expect(singingSong([...lines, line(26, false, false)], line(26, false, false))).toBeNull();
  // A line another voice sang isn't hers: no song, and it isn't part of hers.
  const guestSang = line(26, true, false);
  expect(singingSong([...lines, guestSang], guestSang)).toBeNull();
  expect(singingSong([...lines, guestSang, line(30)], line(30))?.lines).toEqual([
    ...lines,
    line(30),
  ]);
  // A guest singing alone is no song.
  const guest = [line(10, true, false), line(14, true, false), line(18, true, false)];
  expect(singingSong(guest, guest[2]!)).toBeNull();
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

test('a song also ends at a shorter pause the streamer talks in, but not at a guest talking or a word', () => {
  const at = (end: number, text: string, speech = 0.05, host?: boolean): TranscriptLine => ({
    start: (end - 3) * 1000,
    end: end * 1000,
    text,
    speech,
    ...(host !== undefined && { host }),
  });
  const sang = [at(0, '一曲终了'), at(8, '余音绕梁')];
  const next = [at(30, '下一首开始'), at(38, '继续唱')];
  const song = (between: TranscriptLine[]) =>
    currentSong([...sang, ...between, ...next]).map((l) => l.text);
  // 22 s with two lines of talk between: a new song.
  expect(song([at(14, '谢谢大家', 0.8), at(20, '下一首送给你们', 0.8)])).toEqual([
    '下一首开始',
    '继续唱',
  ]);
  // One word over the backing track, or a guest talking: the same song.
  expect(song([at(20, '嗯', 0.8)])).toHaveLength(5);
  expect(song([at(14, '你好', 0.8, false), at(20, '我来了', 0.8, false)])).toHaveLength(6);
  // Talk, but the singing goes on within 15 s: the same song.
  expect(
    currentSong([...sang, at(12, '谢谢', 0.8), at(14, '哈哈', 0.8), at(20, '接着唱')]),
  ).toHaveLength(5);
});

test('a recording playing is no one singing: it neither makes a song nor ends one', () => {
  const played = (end: number): TranscriptLine => ({
    ...line(end),
    played: { title: '花', artist: '夏川りみ' },
  });
  // Lines of a recording alone are no song.
  const recording = [played(10), played(14), played(18), played(22)];
  expect(isSung(recording[3]!)).toBe(false);
  expect(singingSong(recording, recording[3]!)).toBeNull();
  // Nor do they count against her singing, or split her song.
  const mixed = [line(10), played(12), line(14), played(16), line(18)];
  expect(singingSong(mixed, mixed[4]!)?.start).toBe(7000);
});

test("reads the worker's played recording, and only a named one", () => {
  const parse = (played: unknown) =>
    parseWorkerLine(JSON.stringify({ start: 1, end: 2, text: '花', speech: 0.05, played }))?.played;
  expect(parse({ title: '花', artist: '夏川りみ' })).toEqual({ title: '花', artist: '夏川りみ' });
  expect(parse({ title: '花' })).toEqual({ title: '花', artist: '' });
  expect(parse(null)).toBeUndefined();
  expect(parse({ title: '' })).toBeUndefined();
});
