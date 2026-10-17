import { ChatLog } from '../src/adapters/chat-log-files';
import type { Log, Worker } from '../src/app/ports';
import { Transcriber } from '../src/app/transcriber';
import { Transcript } from '../src/core/transcript';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

/** A worker that prints `lines` and exits. */
function fakeWorker(lines: string[], onLine: (line: string) => void): Worker {
  return {
    kill: () => {},
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
            // The second stream's line is sung.
            speech: url === 'url-2' ? 0.05 : 0.9,
            music: url === 'url-2' ? 0.9 : 0.05,
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
      speech: 0.9,
      music: 0.05,
    },
    {
      start: 100_000,
      end: 102_500,
      text: '从 url-2 听到',
      speech: 0.05,
      music: 0.9,
    },
  ]);
  expect(written).toBe(
    '2026-10-16 08:00:00 [主播](speech) 从 url-1 听到\n' +
      '2026-10-16 08:00:00 [主播](sing) 从 url-2 听到\n',
  );
});
