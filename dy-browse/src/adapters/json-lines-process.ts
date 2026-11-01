import type { ChildProcess } from 'node:child_process';
import type { Log } from '../app/ports';

export type Line = Record<string, unknown>;

/**
 * A child process that speaks one JSON object a line on stdin and stdout (chat-bot's ASR worker,
 * the OCR worker). Lines that aren't JSON are logged; stderr is dropped; a process that exits
 * ends whatever is waiting on it.
 */
export class JsonLinesProcess {
  private readonly backlog: (Line | null)[] = [];
  private readonly waiting: ((line: Line | null) => void)[] = [];
  private buffer = '';
  private exited = false;
  private readonly exit: Promise<void>;

  constructor(
    private readonly child: ChildProcess,
    private readonly name: string,
    private readonly log: Log = () => {},
  ) {
    child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
    child.stderr?.on('data', () => {
      // The workers log to stderr; it's noise here.
    });
    this.exit = new Promise((resolve) => {
      child.on('close', () => {
        this.exited = true;
        while (this.waiting.length) this.waiting.shift()!(null);
        this.backlog.push(null);
        resolve();
      });
      child.on('error', () => child.emit('close', 1));
    });
  }

  send(message: object): void {
    this.child.stdin?.write(JSON.stringify(message) + '\n');
  }

  /** Reads lines until `done` says so; rejects when the process exits or `timeoutMs` is up. */
  async readUntil(done: (line: Line) => boolean, what: string, timeoutMs: number): Promise<Line[]> {
    const seen: Line[] = [];
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${this.name}: ${what} timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
    });
    try {
      for (;;) {
        const line = await Promise.race([this.nextLine(), timeout]);
        if (!line) throw new Error(`${this.name}: the worker exited during ${what}`);
        seen.push(line);
        if (done(line)) return seen;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks it to quit, closes stdin, and kills it if it hasn't gone after `killAfterMs`. */
  async close(quit: object, killAfterMs: number): Promise<void> {
    if (this.exited) return;
    this.send(quit);
    this.child.stdin?.end();
    const killer = setTimeout(() => this.child.kill(), killAfterMs);
    await this.exit;
    clearTimeout(killer);
  }

  private nextLine(): Promise<Line | null> {
    if (this.backlog.length) return Promise.resolve(this.backlog.shift()!);
    if (this.exited) return Promise.resolve(null);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private onData(text: string): void {
    this.buffer += text;
    let at: number;
    while ((at = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + 1);
      if (!line) continue;
      let parsed: Line;
      try {
        parsed = JSON.parse(line) as Line;
      } catch {
        this.log(`${this.name}: ${line}`);
        continue;
      }
      const waiter = this.waiting.shift();
      if (waiter) waiter(parsed);
      else this.backlog.push(parsed);
    }
  }
}
