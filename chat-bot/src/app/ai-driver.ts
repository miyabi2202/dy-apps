import type { AskClaude, Log } from './ports';

export interface AiDriverOptions {
  /** Which AI, for the log: claude, codex. */
  name: string;
  /** How many of its calls run at once. */
  concurrency: number;
  log: Log;
}

/**
 * One AI's queue: every call to it (an @'s answer, a pick, a song's name…) is pushed here, and the
 * driver takes them out in order and runs up to `concurrency` at once.
 */
export class AiDriver {
  private readonly queue: (() => void)[] = [];
  /** How many are running now. */
  private running = 0;

  constructor(private readonly options: AiDriverOptions) {}

  /** `ask`, with each call pushed onto this queue. */
  wrap(ask: AskClaude): AskClaude {
    return (question) => this.run(() => ask(question));
  }

  /** Queues `task`, which starts once one of the `concurrency` slots is free; its result. */
  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(() => {
        this.running++;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            this.next();
          });
      });
      if (this.queue.length > 1 || this.running >= this.options.concurrency) {
        this.options.log.debug('ai queued', {
          ai: this.options.name,
          running: this.running,
          waiting: this.queue.length,
        });
      }
      this.next();
    });
  }

  /** Starts what waits, while a slot is free. */
  private next(): void {
    while (this.running < this.options.concurrency) {
      const start = this.queue.shift();
      if (!start) return;
      start();
    }
  }
}
