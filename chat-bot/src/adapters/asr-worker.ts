import { spawn as spawnProcess } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { SpawnWorker } from '../app/ports';

/** A connection to the speech service: lines in and out, until it closes. */
export interface WorkerSocket {
  write(line: string): void;
  /** Disconnects; the service itself goes on. */
  close(): void;
  onLine(handler: (line: string) => void): void;
  onClose(handler: () => void): void;
}

/** Connects to the speech service on `port`, or rejects when nothing is listening. */
export type OpenSocket = (port: number) => Promise<WorkerSocket>;

/** Real TCP, on localhost. */
export const openTcp: OpenSocket = (port) =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.off('error', reject);
      // Whatever goes wrong after that ends the connection, which the bot notices.
      socket.on('error', () => socket.destroy());
      const lines = createInterface({ input: socket });
      resolve({
        write: (line) => void socket.write(`${line}\n`),
        close: () => socket.destroy(),
        onLine: (handler) => void lines.on('line', handler),
        onClose: (handler) => void socket.once('close', handler),
      });
    });
  });

export interface SpeechServiceOptions {
  /** The `asr/` project. */
  asrDir: string;
  port: number;
  /** Where its output goes. */
  logFile: string;
  spawn?: typeof spawnProcess;
}

/**
 * Starts the speech service, `uv run asr/transcribe.py --serve <port>`, detached from the bot so it
 * outlives it (and keeps its models loaded across restarts), logging to `logFile`.
 */
export function startSpeechService({
  asrDir,
  port,
  logFile,
  spawn = spawnProcess,
}: SpeechServiceOptions): void {
  mkdirSync(dirname(logFile), { recursive: true });
  const fd = openSync(logFile, 'a');
  try {
    const child = spawn(
      'uv',
      ['run', '-q', '--directory', asrDir, join(asrDir, 'transcribe.py'), '--serve', String(port)],
      {
        detached: true,
        stdio: ['ignore', fd, fd],
        // Let PyTorch run what Apple's GPU can't on the CPU instead of failing.
        env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
      },
    );
    child.on('error', () => {});
    child.unref();
  } finally {
    closeSync(fd);
  }
}

export interface ConnectWorkerOptions {
  port: number;
  /** Starts the service, when nothing is listening yet. */
  start: () => void;
  connect?: OpenSocket;
  /** How long between tries to connect while the service starts. */
  retryMs?: number;
  /** Give up after this many tries (the first run downloads gigabytes of models). */
  maxTries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The speech service as a worker: connects to it on localhost; when nothing is listening, starts
 * it (once) and tries again until it does (the models take about half a minute to load, and it
 * listens as soon as it starts, so this finds it at once the next time). Its lines are the worker's
 * (asr/transcribe.py's protocol). `kill()` only disconnects, so the service, and the models it has
 * loaded, outlive the bot; `exited` resolves when the connection ends, for a bot that wants the
 * worker again to connect again.
 */
export function connectWorker({
  port,
  start,
  connect = openTcp,
  retryMs = 500,
  maxTries = 1200,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ConnectWorkerOptions): SpawnWorker {
  return ({ onLine, onLog }) => {
    let socket: WorkerSocket | null = null;
    let killed = false;
    const exited = (async (): Promise<number | null> => {
      let started = false;
      for (let tries = 1; !killed; tries++) {
        try {
          socket = await connect(port);
          break;
        } catch (err) {
          if (!started) {
            onLog(`no speech service on port ${port}, starting one`);
            start();
            started = true;
          }
          if (tries >= maxTries)
            throw new Error('the speech service did not come up', { cause: err });
          await sleep(retryMs);
        }
      }
      const connected = socket;
      if (!connected) return null;
      if (killed) {
        connected.close();
        return null;
      }
      connected.onLine(onLine);
      await new Promise<void>((resolve) => connected.onClose(resolve));
      return null;
    })();
    return {
      kill: () => {
        killed = true;
        socket?.close();
      },
      send: (line) => {
        if (!killed) socket?.write(line);
      },
      exited,
    };
  };
}
