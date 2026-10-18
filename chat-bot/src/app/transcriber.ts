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
  /** Called with each sentence as it's heard. */
  onLine?: (line: TranscriptLine) => void;
  spawnWorker: SpawnWorker;
  /** Wait this long before asking for the stream again after it ends or isn't there. */
  retryMs?: number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Keeps the room's speech transcribed into a Transcript: runs the worker on the room's stream,
 * and when it exits (stream ended, URL expired, crash) asks DyHub for the stream again and
 * restarts it. Audio stays inside the worker; only text comes back.
 */
export class Transcriber {
  private stopped = false;
  private worker: Worker | null = null;
  private nextMusicId = 1;
  /** Music requests waiting for the worker's answer, by id. */
  private readonly musicWaiting = new Map<number, (answer: MusicAnswer) => void>();
  private readonly retryMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: TranscriberOptions) {
    this.retryMs = options.retryMs ?? 10_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    const { log } = this.options;
    while (!this.stopped) {
      const url = await this.options.streamUrl().catch((err: unknown) => {
        log.warn('could not get the stream URL', { error: String(err) });
        return null;
      });
      if (this.stopped) break;
      if (url) {
        log.info('transcribing', { url: url.split('?')[0] });
        const code = await this.runWorker(url);
        if (this.stopped) break;
        log.warn('transcriber stopped, restarting', { code });
      }
      await this.sleep(this.retryMs);
    }
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
    if (!worker) throw new Error('not listening to the stream');
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

  private async runWorker(url: string): Promise<number | null> {
    const { transcript, log, spawnWorker } = this.options;
    const worker = spawnWorker(url, {
      onLine: (text) => {
        const answer = parseMusicLine(text);
        if (answer) {
          this.musicWaiting.get(answer.id)?.(answer);
          this.musicWaiting.delete(answer.id);
          return;
        }
        const line = parseWorkerLine(text);
        if (!line) return;
        transcript.add(line);
        this.options.record?.add(speechRecord(line));
        const { text: heard, lang, speech, music, speaker, host, voice } = line;
        log.info('heard', { text: heard, lang, speech, music, speaker, host, voice });
        this.options.onLine?.(line);
      },
      onLog: (text) => log.debug('asr', { text }),
    });
    this.worker = worker;
    try {
      return await worker.exited;
    } catch (err) {
      log.error('could not start the transcriber', {
        error: errorMessage(err),
      });
      return null;
    } finally {
      this.worker = null;
    }
  }
}
