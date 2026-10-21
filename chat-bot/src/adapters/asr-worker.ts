import { createConnection } from 'node:net';
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

export interface ConnectWorkerOptions {
  port: number;
  connect?: OpenSocket;
}

/**
 * The speech service as a worker: connects to it on localhost (it's started by hand, before the
 * bot: `uv run --directory asr asr/transcribe.py --serve <port>`). Its lines are the worker's
 * (asr/transcribe.py's protocol). When nothing is listening, `exited` rejects at once, saying how
 * to start it, and the bot enters the room without speech, trying again now and then. `kill()` only
 * disconnects, so the service, and the models it has loaded, outlive the bot; `exited` resolves
 * when the connection ends, for a bot that wants the worker again to connect again.
 */
export function connectWorker({ port, connect = openTcp }: ConnectWorkerOptions): SpawnWorker {
  return ({ onLine }) => {
    let socket: WorkerSocket | null = null;
    let killed = false;
    const exited = (async (): Promise<number | null> => {
      try {
        socket = await connect(port);
      } catch (err) {
        throw new Error(
          `no speech service on port ${port}: start it first, with ` +
            `uv run --directory chat-bot/asr chat-bot/asr/transcribe.py --serve ${port}`,
          { cause: err },
        );
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
