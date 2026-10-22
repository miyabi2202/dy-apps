import { guestSingingRecord, speechRecord } from '../core/chat-record';
import { errorMessage } from '../core/errors';
import { musicRequest, parseMusicLine, type MusicAnswer, type MusicMatch } from '../core/music';
import {
  isGuestSinging,
  parseStatusLine,
  parseWorkerLine,
  type Transcript,
} from '../core/transcript';
import type { EventBus } from './event-bus';
import type { Log, RoomRecord, SpawnWorker, StreamUrl, Worker } from './ports';

export interface TranscriberOptions {
  streamUrl: StreamUrl;
  /** Where it tells of each sentence heard (`heard`), once it's in the transcript. */
  bus: Pick<EventBus, 'emit'>;
  transcript: Transcript;
  /** Where each sentence is also recorded, as said by 主播. */
  record?: RoomRecord;
  /**
   * Where a line a guest sang is also recorded, as `[连线](sing)` (see isGuestSinging): kept for
   * looking at, read by nothing; everywhere else it's the streamer's.
   */
  guestSinging?: Pick<RoomRecord, 'add'>;
  log: Log;
  spawnWorker: SpawnWorker;
  /**
   * Wait this long before asking for the stream again when it isn't there, ended soon after it
   * started, or the worker stopped.
   */
  retryMs?: number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Calls `run` after `ms`, for the music request's timeout, and returns what stops that;
   * tests pass one they fire by hand.
   */
  timer?: (run: () => void, ms: number) => () => void;
  /**
   * Stop holding the bot out of the room after this long without the models loaded (a first run
   * downloading them, a service that won't start): it enters without speech, which joins later.
   */
  readyTimeoutMs?: number;
  now?: () => number;
}

/**
 * Keeps the room's speech transcribed into a Transcript: starts the worker, which loads its
 * models once, then gives it the room's stream, and when that ends (stream ended, URL expired)
 * asks room-feed for it again and gives it the new one. A worker that stops (crash) is started
 * again. Audio stays inside the worker; only text comes back.
 */
export class Transcriber {
  private stopped = false;
  private worker: Worker | null = null;
  private listening = false;
  /** Whether it has had a stream yet: until then it asks for one every second. */
  private everListened = false;
  private nextMusicId = 1;
  /** Music requests waiting for the worker's answer, by id. */
  private readonly musicWaiting = new Map<number, (answer: MusicAnswer) => void>();
  /** Called when the worker says its models are loaded, or that its stream ended. */
  private onReady = () => {};
  private onStreamEnded = () => {};
  private markReady = () => {};
  private readonly firstReady = new Promise<void>((resolve) => (this.markReady = resolve));
  private readonly retryMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly timer: (run: () => void, ms: number) => () => void;

  constructor(private readonly options: TranscriberOptions) {
    this.retryMs = options.retryMs ?? 10_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.timer =
      options.timer ??
      ((run, ms) => {
        const id = setTimeout(run, ms);
        return () => clearTimeout(id);
      });
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
    let ready = false;
    void this.firstReady.then(() => (ready = true));
    const cancelTimeout = this.timer(() => {
      if (ready || this.stopped) return;
      log.warn('speech recognition is not ready yet, entering the room without it');
      this.markReady();
    }, this.options.readyTimeoutMs ?? 180_000);
    // The same failure again and again (no speech service running yet) is logged once.
    let lastFailure: string | null = null;
    while (!this.stopped) {
      const worker = this.startWorker();
      let failed = false;
      const exited = worker.exited.catch((err: unknown) => {
        failed = true;
        const error = errorMessage(err);
        if (error !== lastFailure) log.error('could not start the transcriber', { error });
        lastFailure = error;
        return null;
      });
      const gone = exited.then(() => 'gone' as const);
      const loaded = await Promise.race([
        new Promise<'ready'>((resolve) => (this.onReady = () => resolve('ready'))),
        gone,
      ]);
      if (loaded === 'ready') {
        lastFailure = null;
        await this.listen(worker, gone);
      }
      this.markReady();
      this.worker = null;
      if (this.stopped) break;
      const code = await exited;
      if (!failed) log.warn('transcriber stopped, restarting', { code });
      await this.sleep(this.retryMs);
    }
    cancelTimeout();
    this.markReady();
  }

  /** With `quitService`, the speech service is asked to exit too, rather than wait for a bot. */
  stop({ quitService = false } = {}): void {
    this.stopped = true;
    if (quitService) this.worker?.send(JSON.stringify({ quit: true }));
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
      const cancel = this.timer(() => {
        this.musicWaiting.delete(id);
        reject(new Error('the worker did not answer'));
      }, timeoutMs);
      this.musicWaiting.set(id, (answered) => {
        cancel();
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
        this.everListened = true;
        worker.send(JSON.stringify({ url }));
        const how = await Promise.race([ended, gone]);
        this.listening = false;
        if (how === 'gone' || this.stopped) return;
        log.warn('stream ended, asking for it again');
        // A stream that played a while had its URL expire, or a hiccup: ask again at once.
        if (this.now() - started > 60_000) continue;
      }
      // Until the first stream, ask every second: room-feed has it moments after the bot enters the
      // room, and the streamer often welcomes the bot by name right then.
      const wait = this.everListened ? this.retryMs : Math.min(this.retryMs, 1000);
      if ((await Promise.race([this.sleep(wait), gone])) === 'gone') return;
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
        if (status === 'busy') {
          log.warn('the speech service is serving another bot; trying again later');
          return this.worker?.kill();
        }
        const line = parseWorkerLine(text);
        if (!line) return;
        transcript.add(line);
        this.options.record?.add(speechRecord(line));
        if (isGuestSinging(line)) this.options.guestSinging?.add(guestSingingRecord(line));
        const { text: heard, lang, speech, music, speaker, host, voice } = line;
        log.info('heard', { text: heard, lang, speech, music, speaker, host, voice });
        this.options.bus.emit('heard', line);
      },
      onLog: (text) => log.debug('asr', { text }),
    });
    this.worker = worker;
    return worker;
  }
}
