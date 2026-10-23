import { ChatLog } from '../../../src/adapters/files/chat-log-files';
import type { Log, Worker } from '../../../src/app/ports';
import { Transcriber } from '../../../src/app/songs/transcriber';
import { currentSong, Transcript } from '../../../src/core/songs/transcript';
import { fakeBus } from '../../support/fakes';

const silentLog: Log = { debug() {}, info() {}, warn() {}, error() {} };

/**
 * A worker as transcribe.py behaves: says it's ready, and answers each stream URL sent to it with
 * `hear(url)`'s lines and then the stream ending. `kill()` makes it exit.
 */
function fakeWorker(
  onLine: (line: string) => void,
  hear: (url: string) => string[],
  answerMusic: (id: number) => object | undefined = () => undefined,
): Worker & { urls: string[] } {
  let exit: (code: number | null) => void = () => {};
  const urls: string[] = [];
  void Promise.resolve().then(() => onLine(JSON.stringify({ ready: true })));
  return {
    urls,
    kill: () => exit(null),
    send: (line) => {
      const request = JSON.parse(line) as { url?: string; music_id?: number };
      if (request.url !== undefined) {
        urls.push(request.url);
        const heard = hear(request.url);
        void Promise.resolve().then(() => {
          heard.forEach(onLine);
          onLine(JSON.stringify({ stream_ended: true, code: 0 }));
        });
      } else if (request.music_id !== undefined) {
        const answer = answerMusic(request.music_id);
        if (answer) onLine(JSON.stringify({ music_id: request.music_id, ...answer }));
      }
    },
    exited: new Promise((resolve) => (exit = resolve)),
  };
}

const sentence = (url: string) =>
  JSON.stringify({
    start: 100,
    end: 102.5,
    text: `从 ${url} 听到`,
    // The first stream's line is said in Mandarin by someone linked up with the streamer, the
    // second's is a Japanese song they sing.
    lang: url === 'url-2' ? 'ja' : 'zh',
    speech: url === 'url-2' ? 0.05 : 0.9,
    music: url === 'url-2' ? 0.9 : 0.05,
    speaker: url === 'url-2' ? 3 : 1,
    host: false,
    voice: null,
  });

test('keeps what the worker hears, giving the same worker a fresh stream URL when one ends', async () => {
  const transcript = new Transcript(Infinity);
  let written = '';
  const sung: string[] = [];
  const chatLog = new ChatLog('/data/chat/1', {
    now: () => Date.UTC(2026, 9, 16, 8, 0, 0),
    append: (_path, text) => (written += text),
  });
  const bus = fakeBus();
  const heard: string[] = [];
  bus.on('heard', (line) => heard.push(line.text));
  const urls = ['url-1', null, 'url-2'];
  const workers: ReturnType<typeof fakeWorker>[] = [];
  const transcriber: Transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(urls.shift() ?? null),
    bus,
    transcript,
    record: chatLog,
    singing: {
      add: (record) => sung.push(`${record.sender} ${record.type} ${record.tags?.join(' ')}`),
    },
    log: silentLog,
    spawnWorker: ({ onLine }) => {
      const worker = fakeWorker(onLine, (url) => {
        if (url === 'url-2') transcriber.stop();
        return ['not json', sentence(url)];
      });
      workers.push(worker);
      return worker;
    },
    sleep: () => Promise.resolve(),
  });
  await transcriber.run();

  expect(heard).toEqual(['从 url-1 听到', '从 url-2 听到']);
  // The models loaded once, for both streams.
  expect(workers).toHaveLength(1);
  expect(workers[0]?.urls).toEqual(['url-1', 'url-2']);
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
      speaker: 3,
      host: false,
    },
  ]);
  // Another voice's singing is theirs in the chat record too, as in the sung lines.
  expect(written).toBe(
    '2026-10-16 08:00:00+00:00 [连线](speech) 从 url-1 听到\n' +
      '2026-10-16 08:00:00+00:00 [连线](sing) 从 url-2 听到\n',
  );
  expect(sung).toEqual(['连线 sing 声3']);
});

test('is ready once the models load, before any stream; and starts a worker that stops again', async () => {
  let spawned = 0;
  let crash: () => void = () => {};
  const transcriber = new Transcriber({
    // No stream yet: keeps asking.
    streamUrl: () => Promise.resolve(null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: silentLog,
    spawnWorker: ({ onLine }) => {
      spawned++;
      const worker = fakeWorker(onLine, () => []);
      crash = () => worker.kill();
      return worker;
    },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  const running = transcriber.run();
  await transcriber.ready();
  expect(spawned).toBe(1);

  crash();
  while (spawned < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  transcriber.stop();
  await running;
});

test('stopping with quitService asks the speech service to exit before disconnecting', async () => {
  const sent: string[] = [];
  const transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: silentLog,
    spawnWorker: ({ onLine }) => {
      const worker = fakeWorker(onLine, () => []);
      return {
        ...worker,
        send: (line) => sent.push(line),
        kill: () => {
          sent.push('killed');
          worker.kill();
        },
      };
    },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 0)),
  });
  const running = transcriber.run();
  await transcriber.ready();

  transcriber.stop({ quitService: true });
  await running;
  expect(sent).toEqual([JSON.stringify({ quit: true }), 'killed']);
});

test('a busy speech service is let go, so the bot enters the room and tries again later', async () => {
  let spawned = 0;
  const warnings: string[] = [];
  const transcriber: Transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: { ...silentLog, warn: (message) => void warnings.push(message) },
    spawnWorker: ({ onLine }) => {
      spawned++;
      let exit: (code: number | null) => void = () => {};
      // Serving another bot: says so instead of ready.
      void Promise.resolve().then(() => onLine(JSON.stringify({ busy: true })));
      return { kill: () => exit(null), send: () => {}, exited: new Promise((r) => (exit = r)) };
    },
    sleep: () => {
      if (spawned >= 2) transcriber.stop();
      return Promise.resolve();
    },
  });
  const running = transcriber.run();
  await transcriber.ready();
  await running;
  expect(spawned).toBe(2);
  expect(warnings).toContain('the speech service is serving another bot; trying again later');
});

test('with no speech service, the bot enters the room at once, and the failure is logged once', async () => {
  let tries = 0;
  const errors: string[] = [];
  const warnings: string[] = [];
  const transcriber: Transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: {
      ...silentLog,
      error: (message) => void errors.push(message),
      warn: (message) => void warnings.push(message),
    },
    spawnWorker: () => {
      tries++;
      return { kill: () => {}, send: () => {}, exited: Promise.reject(new Error('no service')) };
    },
    sleep: () => {
      if (tries >= 3) transcriber.stop();
      return Promise.resolve();
    },
  });
  const running = transcriber.run();
  await transcriber.ready();
  await running;
  expect(tries).toBe(3);
  expect(errors).toEqual(['could not start the transcriber']);
  expect(warnings).toEqual([]);
});

test('asks for the stream every second until the first one, then every retryMs', async () => {
  const urls = [null, null, 'url-1', null];
  const waits: number[] = [];
  const transcriber: Transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(urls.shift() ?? null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: silentLog,
    spawnWorker: ({ onLine }) => fakeWorker(onLine, () => []),
    retryMs: 10_000,
    sleep: (ms) => {
      waits.push(ms);
      if (waits.length >= 4) transcriber.stop();
      return Promise.resolve();
    },
  });
  await transcriber.run();
  // Two misses a second apart; after the stream (which ended at once), the usual 10 s.
  expect(waits.slice(0, 3)).toEqual([1000, 1000, 10_000]);
});

test('lets the bot enter the room when the models take too long', async () => {
  const timers: (() => void)[] = [];
  const warnings: string[] = [];
  const transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(null),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: { ...silentLog, warn: (message) => void warnings.push(message) },
    // Never ready, never exits.
    spawnWorker: () => ({ kill: () => {}, send: () => {}, exited: new Promise(() => {}) }),
    timer: (run) => {
      timers.push(run);
      return () => {};
    },
  });
  void transcriber.run();
  let entered = false;
  void transcriber.ready().then(() => (entered = true));
  await Promise.resolve();
  expect(entered).toBe(false);
  timers.forEach((fire) => fire());
  await Promise.resolve();
  expect(entered).toBe(true);
  expect(warnings).toEqual(['speech recognition is not ready yet, entering the room without it']);
  transcriber.stop();
});

test('asks the worker what music is playing, telling a match, no match and a failure apart', async () => {
  const answers: object[] = [
    { title: 'Aimaimoko', artist: 'Inori Minase' },
    { title: null, artist: null },
    { error: 'Shazam is down' },
  ];
  let streaming: () => void = () => {};
  const started = new Promise<void>((resolve) => (streaming = resolve));
  // The music request's timeout, fired by hand.
  let timedOut: () => void = () => {};
  const transcriber = new Transcriber({
    streamUrl: () => Promise.resolve('url'),
    bus: fakeBus(),
    transcript: new Transcript(),
    log: silentLog,
    timer: (run) => {
      timedOut = run;
      return () => {};
    },
    spawnWorker: ({ onLine }) => {
      const worker = fakeWorker(
        onLine,
        () => [],
        () => answers.shift(),
      );
      // The stream plays until the worker is stopped.
      const send = worker.send.bind(worker);
      worker.send = (line) => {
        if (line.includes('"url"')) return streaming();
        send(line);
      };
      return worker;
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
  const unanswered = transcriber.identifyMusic(10);
  timedOut();
  await expect(unanswered).rejects.toThrow('the worker did not answer');
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
