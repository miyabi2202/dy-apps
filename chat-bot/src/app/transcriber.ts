import { speechRecord } from '../core/chat-record';
import { errorMessage } from '../core/errors';
import { musicRequest, parseMusicLine, type MusicAnswer, type MusicMatch } from '../core/music';
import { parseWorkerLine, type Transcript, type TranscriptLine } from '../core/transcript';
import type { Log, RoomRecord, SpawnWorker, StreamUrl, Worker } from './ports';

export interface TranscriberOptions {
  streamUrl: StreamUrl;
  transcript: Transcript;
  /** Where each sentence is also recorded, as said by 主播. */
  record?: RoomRecord;
  log: Log;
  spawnWorker: SpawnWorker;
  /**
   * Wait this long before asking for the stream again when it isn't there, ended soon after it
   * started, or the worker stopped.
   */
  retryMs?: number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Keeps the room's speech transcribed into a Transcript: starts the worker, which loads its
 * models once, then gives it the room's stream, and when that ends (stream ended, URL expired)
 * asks DyHub for it again and gives it the new one. A worker that stops (crash) is started
 * again. Audio stays inside the worker; only text comes back.
 */
export class Transcriber {
  private stopped = false;
  private worker: Worker | null = null;
  private listening = false;
  private nextMusicId = 1;
  /** Music requests waiting for the worker's answer, by id. */
  private readonly musicWaiting = new Map<number, (answer: MusicAnswer) => void>();
  private readonly lineHandlers: ((line: TranscriptLine) => void)[] = [];
  /** Called when the worker says its models are loaded, or that its stream ended. */
  private onReady = () => {};
  private onStreamEnded = () => {};
  private markReady = () => {};
  private readonly firstReady = new Promise<void>((resolve) => (this.markReady = resolve));
  private readonly retryMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: TranscriberOptions) {
    this.retryMs = options.retryMs ?? 10_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  /** Calls `handler` with each sentence as it's heard. */
  onLine(handler: (line: TranscriptLine) => void): void {
    this.lineHandlers.push(handler);
  }

  /**
   * Resolves once the worker's models are loaded (about half a minute after `run()`), or when
   * its first start failed: the bot enters the room then, so it hears the streamer from the start.
   */
  ready(): Promise<void> {
    return this.firstReady;
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    const { log } = this.options;
    while (!this.stopped) {
      const worker = this.startWorker();
      const exited = worker.exited.catch((err: unknown) => {
        log.error('could not start the transcriber', { error: errorMessage(err) });
        return null;
      });
      const gone = exited.then(() => 'gone' as const);
      const loaded = await Promise.race([
        new Promise<'ready'>((resolve) => (this.onReady = () => resolve('ready'))),
        gone,
      ]);
      if (loaded === 'ready') await this.listen(worker, gone);
      this.markReady();
      this.worker = null;
      if (this.stopped) break;
      log.warn('transcriber stopped, restarting', { code: await exited });
      await this.sleep(this.retryMs);
    }
    this.markReady();
  }

  stop(): void {
    this.stopped = true;
    this.worker?.kill();
  }

  /**
   * What music is playing in the stream, looked up by the worker from the last 15 s of audio;
   * null when nothing matched. Throws when the stream isn't being listened to, the lookup
   * failed, or there's no answer within `timeoutMs`.
   */
  async identifyMusic(timeoutMs = 30_000): Promise<MusicMatch | null> {
    const worker = this.worker;
    if (!worker || !this.listening) throw new Error('not listening to the stream');
    const id = this.nextMusicId++;
    const answer = await new Promise<MusicAnswer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.musicWaiting.delete(id);
        reject(new Error('the worker did not answer'));
      }, timeoutMs);
      this.musicWaiting.set(id, (answered) => {
        clearTimeout(timer);
        resolve(answered);
      });
      worker.send(musicRequest(id));
    });
    if (answer.error) throw new Error(answer.error);
    this.options.log.info('music', { ...answer.match });
    return answer.match;
  }

  /** Gives the loaded worker the room's stream, again each time it ends, until the worker's gone. */
  private async listen(worker: Worker, gone: Promise<'gone'>): Promise<void> {
    const { log } = this.options;
    this.markReady();
    while (!this.stopped) {
      const url = await this.options.streamUrl().catch((err: unknown) => {
        log.warn('could not get the stream URL', { error: String(err) });
        return null;
      });
      if (this.stopped) return;
      if (url) {
        log.info('transcribing', { url: url.split('?')[0] });
        const started = this.now();
        const ended = new Promise<'ended'>(
          (resolve) => (this.onStreamEnded = () => resolve('ended')),
        );
        this.listening = true;
        worker.send(JSON.stringify({ url }));
        const how = await Promise.race([ended, gone]);
        this.listening = false;
        if (how === 'gone' || this.stopped) return;
        log.warn('stream ended, asking for it again');
        // A stream that played a while had its URL expire, or a hiccup: ask again at once.
        if (this.now() - started > 60_000) continue;
      }
      if ((await Promise.race([this.sleep(this.retryMs), gone])) === 'gone') return;
    }
  }

  private startWorker(): Worker {
    const { transcript, log, spawnWorker } = this.options;
    const worker = spawnWorker({
      onLine: (text) => {
        const answer = parseMusicLine(text);
        if (answer) {
          this.musicWaiting.get(answer.id)?.(answer);
          this.musicWaiting.delete(answer.id);
          return;
        }
        const status = parseStatusLine(text);
        if (status === 'ready') return this.onReady();
        if (status === 'stream_ended') return this.onStreamEnded();
        const line = parseWorkerLine(text);
        if (!line) return;
        transcript.add(line);
        this.options.record?.add(speechRecord(line));
        const { text: heard, lang, speech, music, speaker, host, voice } = line;
        log.info('heard', { text: heard, lang, speech, music, speaker, host, voice });
        for (const handler of this.lineHandlers) handler(line);
      },
      onLog: (text) => log.debug('asr', { text }),
    });
    this.worker = worker;
    return worker;
  }
}

/** The worker's `{"ready": true}` (models loaded) or `{"stream_ended": true, …}`, or null. */
function parseStatusLine(text: string): 'ready' | 'stream_ended' | null {
  if (!text.startsWith('{')) return null;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json.ready === true) return 'ready';
    if (json.stream_ended === true) return 'stream_ended';
  } catch {
    // Not JSON: not a status.
  }
  return null;
}
