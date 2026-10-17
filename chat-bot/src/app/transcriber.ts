import { speechRecord } from '../core/chat-record';
import { parseWorkerLine, type Transcript } from '../core/transcript';
import type { Log, RoomRecord, SpawnWorker, StreamUrl, Worker } from './ports';

export interface TranscriberOptions {
  streamUrl: StreamUrl;
  transcript: Transcript;
  /** Where each sentence is also recorded, as said by 主播. */
  record?: RoomRecord;
  log: Log;
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

  private async runWorker(url: string): Promise<number | null> {
    const { transcript, log, spawnWorker } = this.options;
    const worker = spawnWorker(url, {
      onLine: (text) => {
        const line = parseWorkerLine(text);
        if (!line) return;
        transcript.add(line);
        this.options.record?.add(speechRecord(line));
        const { text: heard, bgm, emotion, speech, singing } = line;
        log.info('heard', { text: heard, bgm, emotion, speech, singing });
      },
      onLog: (text) => log.debug('asr', { text }),
    });
    this.worker = worker;
    try {
      return await worker.exited;
    } catch (err) {
      log.error('could not start the transcriber', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      this.worker = null;
    }
  }
}
