import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import type { BotLog } from '../src/chat-bot';
import { ChatLog, type ChatRecord } from '../src/chat-log';
import { Transcriber } from '../src/transcriber';
import { Transcript } from '../src/transcript';

const silentLog: BotLog = { debug() {}, info() {}, warn() {}, error() {} };

/** A worker that prints `lines` and exits. */
function fakeWorker(lines: string[]): ChildProcess {
  const worker = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough();
  Object.assign(worker, { stdout, stderr: new PassThrough(), kill: () => true });
  setImmediate(() => {
    stdout.end(lines.join('\n') + '\n');
    stdout.on('close', () => worker.emit('close', 0));
  });
  return worker;
}

test('keeps what the worker hears, and restarts it on a fresh stream URL when it ends', async () => {
  const transcript = new Transcript(Infinity);
  let records: ChatRecord[] = [];
  const chatLog = new ChatLog('/data/chat/1', {
    write: (_path, value) => (records = structuredClone(value as ChatRecord[])),
  });
  const urls = ['url-1', null, 'url-2'];
  const started: string[] = [];
  let transcriber: Transcriber | null = null;
  transcriber = new Transcriber({
    streamUrl: () => Promise.resolve(urls.shift() ?? null),
    transcript,
    chatLog,
    log: silentLog,
    spawnWorker: (url) => {
      started.push(url);
      if (started.length === 2) transcriber?.stop();
      return fakeWorker([
        'not json',
        JSON.stringify({
          start: 100,
          end: 102.5,
          text: `从 ${url} 听到`,
          bgm: true,
          emotion: 'HAPPY',
        }),
      ]);
    },
    sleep: () => Promise.resolve(),
  });
  await transcriber.run();

  expect(started).toEqual(['url-1', 'url-2']);
  expect(transcript.recent(Infinity)).toEqual([
    { start: 100_000, end: 102_500, text: '从 url-1 听到', bgm: true, emotion: 'HAPPY' },
    { start: 100_000, end: 102_500, text: '从 url-2 听到', bgm: true, emotion: 'HAPPY' },
  ]);
  expect(records.map(({ sender, type }) => `${sender} ${type}`)).toEqual([
    '主播 speech',
    '主播 speech',
  ]);
  expect(records[0]).toMatchObject({ text: '从 url-1 听到', emotion: 'HAPPY' });
});
