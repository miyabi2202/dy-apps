import type { DataStore } from '../../src/app/ports';

/** A DataStore in memory, for tests; `files` shows what was written. */
export class MemoryStore implements DataStore {
  readonly files = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(initial)) this.files.set(path, text);
  }

  read(path: string): string | null {
    return this.files.get(path) ?? null;
  }

  write(path: string, text: string): void {
    this.files.set(path, text);
  }

  append(path: string, text: string): void {
    this.files.set(path, (this.files.get(path) ?? '') + text);
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  list(dir: string): string[] {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }
}

/** A Pace-ready fake: logs each wait as `wait <ms>` in `log`. */
export function logWait(log: string[]): (ms: number) => Promise<void> {
  return (ms) => {
    log.push(`wait ${ms}`);
    return Promise.resolve();
  };
}
