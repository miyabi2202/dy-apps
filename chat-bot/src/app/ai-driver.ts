import { done, failed, type Command } from './command';
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
  private limit: number;

  constructor(private readonly options: AiDriverOptions) {
    this.limit = options.concurrency;
  }

  /** How many of its calls run at once; raising it starts what waits. */
  get concurrency(): number {
    return this.limit;
  }

  set concurrency(n: number) {
    this.limit = n;
    this.next();
  }

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
      if (this.queue.length > 1 || this.running >= this.limit) {
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
    while (this.running < this.limit) {
      const start = this.queue.shift();
      if (!start) return;
      start();
    }
  }
}

/** At most this many at once, so an admin's typo can't start dozens of Claude processes. */
const MAX_CONCURRENCY = 5;

/**
 * `/并发数 2` sets how many calls run at once in each of `targets` (the Claude and Codex drivers,
 * and auto-reply's checks).
 */
export function concurrencyCommand(targets: { concurrency: number }[], log: Log): Command {
  return {
    name: '并发数',
    adminOnly: true,
    price: 0,
    run: (args) => {
      const n = Number(args);
      if (!/^\d+$/.test(args) || n < 1 || n > MAX_CONCURRENCY)
        return failed(`并发数要写成 1 到 ${MAX_CONCURRENCY} 的整数，用法：/并发数 2`);
      for (const target of targets) target.concurrency = n;
      log.info('concurrency', { concurrency: n });
      return done('已处理并发数请求');
    },
  };
}
