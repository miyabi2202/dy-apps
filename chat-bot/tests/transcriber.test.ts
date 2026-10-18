import { ChatLog } from '../src/adapters/chat-log-files';
import type { Log, Worker } from '../src/app/ports';
import { Transcriber } from '../src/app/transcriber';
import { currentSong, Transcript } from '../src/core/transcript';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

/** A worker that prints `lines` and exits. */
function fakeWorker(lines: string[], onLine: (line: string) => void): Worker {
  return {
    kill: () => {},
    send: () => {},
    exited: Promise.resolve().then(() => {
      lines.forEach(onLine);
      return 0;
    }),
  };
}

test('keeps what the worker hears, and restarts it on a fresh stream URL when it ends', async () => {
  const transcript = new Transcript(Infinity);
  let written = '';
  const chatLog = new ChatLog('/data/chat/1', {
    now: () => Date.UTC(2026, 9, 16, 8, 0, 0),
    append: (_path, text) => (written += text),
  });
  const urls = ['url-1', null, 'url-2'];
  const started: string[] = [];
  let transcriber: Transcriber | null = null;
  transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(urls.shift() ?? null),
    transcript,
    record: chatLog,
    log: silentLog,
    spawnWorker: (url, { onLine }) => {
      started.push(url);
      if (started.length === 2) transcriber?.stop();
      return fakeWorker(
        [
          'not json',
          JSON.stringify({
            start: 100,
            end: 102.5,
            text: `从 ${url} 听到`,
            // The first stream's line is said in Mandarin by someone linked up with the
            // streamer, the second's is a Japanese song (so there's no telling whose voice).
            lang: url === 'url-2' ? 'ja' : 'zh',
            speech: url === 'url-2' ? 0.05 : 0.9,
            music: url === 'url-2' ? 0.9 : 0.05,
            speaker: url === 'url-2' ? null : 1,
            host: url === 'url-2' ? null : false,
            voice: null,
          }),
        ],
        onLine,
      );
    },
    sleep: () => Promise.resolve(),
  });
  await transcriber.run();

  expect(started).toEqual(['url-1', 'url-2']);
  expect(transcript.recent(Infinity)).toEqual([
    {
      start: 100_000,
      end: 102_500,
      text: '从 url-1 听到',
      lang: 'zh',
      speech: 0.9,
      music: 0.05,
      speaker: 1,
      host: false,
    },
    {
      start: 100_000,
      end: 102_500,
      text: '从 url-2 听到',
      lang: 'ja',
      speech: 0.05,
      music: 0.9,
    },
  ]);
  expect(written).toBe(
    '2026-10-16 08:00:00 [连线](speech) 从 url-1 听到\n' +
      '2026-10-16 08:00:00 [主播](sing) 从 url-2 听到\n',
  );
});

test('asks the worker what music is playing, telling a match, no match and a failure apart', async () => {
  const answers: object[] = [
    { title: 'Aimaimoko', artist: 'Inori Minase' },
    { title: null, artist: null },
    { error: 'Shazam is down' },
  ];
  let finish: (code: number) => void = () => {};
  let workerStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => (workerStarted = resolve));
  const transcriber = new Transcriber({
    streamUrl: () => Promise.resolve('url'),
    transcript: new Transcript(),
    log: silentLog,
    spawnWorker: (_url, { onLine }) => {
      workerStarted();
      return {
        kill: () => finish(0),
        // Answers at once, while there are answers left; then never.
        send: (line) => {
          const answer = answers.shift();
          const { music_id } = JSON.parse(line) as { music_id: number };
          if (answer) onLine(JSON.stringify({ music_id, ...answer }));
        },
        exited: new Promise((resolve) => (finish = resolve)),
      };
    },
    sleep: () => Promise.resolve(),
  });
  await expect(transcriber.identifyMusic()).rejects.toThrow('not listening to the stream');

  const running = transcriber.run();
  await started;
  await expect(transcriber.identifyMusic()).resolves.toEqual({
    title: 'Aimaimoko',
    artist: 'Inori Minase',
  });
  await expect(transcriber.identifyMusic()).resolves.toBeNull();
  await expect(transcriber.identifyMusic()).rejects.toThrow('Shazam is down');
  await expect(transcriber.identifyMusic(10)).rejects.toThrow('the worker did not answer');
  transcriber.stop();
  await running;
});

test('the current song starts after the last pause of over a minute between sung lines', () => {
  const line = (s: number, text: string, speech = 0.05) => ({
    start: s * 1000,
    end: s * 1000 + 4000,
    text,
    speech,
  });
  const lines = [
    line(0, 'I dream'),
    line(10, 'I dream'),
    line(40, '下一首唱什么呢', 0.8),
    line(130, 'どうしようもないほどに'),
    line(150, '救いたいだけ'),
    line(160, '好听吗', 0.8),
  ];
  expect(currentSong(lines).map((l) => l.text)).toEqual([
    'どうしようもないほどに',
    '救いたいだけ',
    '好听吗',
  ]);
  // One song throughout, or nothing sung: all of it.
  expect(currentSong(lines.slice(0, 2))).toHaveLength(2);
  expect(currentSong([line(0, '你好', 0.8)])).toHaveLength(1);
});
