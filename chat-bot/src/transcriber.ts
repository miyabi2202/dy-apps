import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { BotLog } from './chat-bot';
import type { Transcript } from './transcript';

/** Starts the transcription worker on a stream URL. */
export type SpawnWorker = (url: string) => ChildProcess;

/** `uv run asr/transcribe.py <url>`, in the package's `asr/` project. */
export function uvWorker(asrDir: string): SpawnWorker {
  return (url) =>
    spawn('uv', ['run', '-q', '--directory', asrDir, join(asrDir, 'transcribe.py'), url], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Let PyTorch run what Apple's GPU can't on the CPU instead of failing.
      env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
    });
}

export interface TranscriberOptions {
  /** The room's stream URL, or null while there isn't one (not live, or DyHub still opening it). */
  streamUrl: () => Promise<string | null>;
  transcript: Transcript;
  log: BotLog;
  spawnWorker: SpawnWorker;
  /** Wait this long before asking for the stream again after it ends or isn't there. */
  retryMs?: number;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
}

/** The worker's output: one sentence per line, times in seconds. */
interface WorkerLine {
  start: number;
  end: number;
  text: string;
  bgm?: boolean;
  emotion?: string | null;
}

/**
 * Keeps the room's speech transcribed into a Transcript: runs the worker on the room's stream,
 * and when it exits (stream ended, URL expired, crash) asks DyHub for the stream again and
 * restarts it. Audio stays inside the worker; only text comes back.
 */
export class Transcriber {
  private stopped = false;
  private worker: ChildProcess | null = null;
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

  private runWorker(url: string): Promise<number | null> {
    const { transcript, log, spawnWorker } = this.options;
    const worker = spawnWorker(url);
    this.worker = worker;
    if (worker.stdout) {
      createInterface({ input: worker.stdout }).on('line', (text) => {
        const line = parseLine(text);
        if (!line) return;
        transcript.add(line);
        log.info('heard', { text: line.text, bgm: line.bgm, emotion: line.emotion });
      });
    }
    if (worker.stderr) {
      createInterface({ input: worker.stderr }).on('line', (text) => log.debug('asr', { text }));
    }
    return new Promise((resolve) => {
      worker.on('error', (err) => {
        log.error('could not start the transcriber', { error: err.message });
        resolve(null);
      });
      worker.on('close', (code) => {
        this.worker = null;
        resolve(code);
      });
    });
  }
}

function parseLine(text: string) {
  let line: WorkerLine;
  try {
    line = JSON.parse(text) as WorkerLine;
  } catch {
    return null;
  }
  if (typeof line.text !== 'string' || !line.text) return null;
  return {
    start: line.start * 1000,
    end: line.end * 1000,
    text: line.text,
    bgm: line.bgm === true,
    emotion: line.emotion ?? null,
  };
}
