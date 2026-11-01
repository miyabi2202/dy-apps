import { EmptyReadError, RunStopped, StreamStartedError } from '../core/errors';
import type { DataStore, Log } from './ports';
import type { RunLock } from './run-lock';
import type { StreamGuard } from './stream-guard';

/** One thing a run does (the streamer's posts, a topic, the knowledge base, the feed). */
export interface Step {
  name: string;
  run(): Promise<void>;
}

export interface BrowseRunOptions {
  guard: StreamGuard;
  lock: RunLock;
  data: DataStore;
  log: Log;
  steps: readonly Step[];
  /**
   * Saves what the page showed when a step failed, as `screenshots/<name>.png` in `data`, and says
   * where; null when no page was open. A failure to save is never the run's failure.
   */
  snapshot?: (name: string) => Promise<string | null>;
  /** Closes the browser and the workers; always called, after the lock is taken. */
  cleanup?: () => Promise<void>;
  now?: () => number;
}

export interface RunOutcome {
  /** 0 when every step ran or a stream ended the run cleanly; 1 when the run was refused or stopped. */
  code: 0 | 1;
  done: string[];
  /** Why it stopped early, if it did. */
  stopped: string | null;
}

/**
 * A browse run: refuses while a stream is on, holds the lock file for the whole run, and does its
 * steps one after the other. A captcha or login wall, a reader that gets nothing (its raw bodies are
 * saved), or a stream that starts, stops the run at that point with a clear message; nothing is
 * retried. Whatever ends it, the lock is released and the browser and workers are closed.
 */
export class BrowseRun {
  constructor(private readonly options: BrowseRunOptions) {}

  async run(): Promise<RunOutcome> {
    const { guard, lock, log, steps, cleanup } = this.options;
    const done: string[] = [];
    try {
      await guard.assertNoStream();
      lock.acquire();
    } catch (e) {
      if (e instanceof RunStopped) {
        log(e.message);
        return { code: 1, done, stopped: e.message };
      }
      throw e;
    }
    try {
      for (const step of steps) {
        log(`开始：${step.name}`);
        await step.run();
        done.push(step.name);
      }
      return { code: 0, done, stopped: null };
    } catch (e) {
      await this.snapshot();
      if (!(e instanceof RunStopped)) throw e;
      if (e instanceof EmptyReadError) this.saveBodies(e);
      log(e.message);
      // A stream that started is the user's own doing, not a failure.
      return { code: e instanceof StreamStartedError ? 0 : 1, done, stopped: e.message };
    } finally {
      try {
        await cleanup?.();
      } finally {
        lock.release();
      }
    }
  }

  /** What the page showed when the run failed, saved before the browser closes. */
  private async snapshot(): Promise<void> {
    const { snapshot, log } = this.options;
    if (!snapshot) return;
    const stamp = new Date((this.options.now ?? Date.now)()).toISOString().replace(/[:.]/g, '-');
    const path = await snapshot(`${stamp}-failed`).catch(() => null);
    if (path) log(`页面截图已保存：${path}`);
  }

  /** Keeps the raw bodies a reader got nothing from, in `screenshots/`, to see what Douyin sent. */
  private saveBodies(error: EmptyReadError): void {
    const { data, log } = this.options;
    const stamp = new Date((this.options.now ?? Date.now)()).toISOString().replace(/[:.]/g, '-');
    const kind = error.kind.replace(/[^\p{L}\p{N}]+/gu, '_');
    const bodies = error.bodies.length
      ? error.bodies
      : ['（没有收到任何响应：页面没有发出这个请求）'];
    const paths = bodies.map((body, i) => {
      const path = `screenshots/${stamp}-${kind}-${i + 1}.txt`;
      data.write(path, body);
      return path;
    });
    error.savedTo = paths[0] ?? null;
    log(`原始响应已保存：${paths.join('、')}`);
  }
}
