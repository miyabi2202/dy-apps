import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { PassThrough, Writable } from 'node:stream';

type Message = Record<string, unknown>;

/**
 * A fake `spawn` for a worker that speaks JSON lines: `onStart` is what it prints at start, and
 * `onMessage` what it prints for each line written to its stdin. `quit` (or closing stdin) ends it.
 */
export function fakeWorker({
  onStart = (say: (m: Message) => void) => say({ ready: true }),
  onMessage,
}: {
  onStart?: (say: (m: Message) => void) => void;
  onMessage: (message: Message, say: (m: Message) => void) => void;
}) {
  const calls: { command: string; args: readonly string[] }[] = [];
  const written: Message[] = [];
  const spawnProcess = ((command: string, args: readonly string[]) => {
    calls.push({ command, args });
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const stdout = new PassThrough();
    let closed = false;
    const say = (m: Message) => {
      if (!closed) stdout.write(JSON.stringify(m) + '\n');
    };
    const close = () => {
      if (closed) return;
      closed = true;
      setImmediate(() => child.emit('close', 0));
    };
    let buffer = '';
    child.stdout = stdout;
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk: Buffer, _enc, done) {
        buffer += chunk.toString();
        let at: number;
        while ((at = buffer.indexOf('\n')) >= 0) {
          const message = JSON.parse(buffer.slice(0, at)) as Message;
          buffer = buffer.slice(at + 1);
          written.push(message);
          if (message.quit) close();
          else onMessage(message, say);
        }
        done();
      },
      final(done) {
        close();
        done();
      },
    });
    child.kill = () => {
      close();
      return true;
    };
    setImmediate(() => onStart(say));
    return child;
  }) as unknown as typeof spawn;
  return { spawnProcess, calls, written };
}
