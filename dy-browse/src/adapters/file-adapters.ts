import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { LockInfo, LockStore } from '../app/run-lock';
import type { DataStore, KnowledgeFile, KnowledgeSource } from '../app/ports';

/** `dy-browse/data/` on disk. Every path is relative to it and may not climb out of it. */
export class FileDataStore implements DataStore {
  constructor(private readonly root: string) {}

  private resolve(path: string): string {
    const full = join(this.root, path);
    if (relative(this.root, full).startsWith('..')) throw new Error(`path outside data: ${path}`);
    return full;
  }

  read(path: string): string | null {
    try {
      return readFileSync(this.resolve(path), 'utf8');
    } catch {
      return null;
    }
  }

  write(path: string, text: string): void {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }

  append(path: string, text: string): void {
    const full = this.resolve(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, text);
  }

  remove(path: string): void {
    rmSync(this.resolve(path), { force: true });
  }

  list(dir: string): string[] {
    return walk(this.resolve(dir)).map((file) => relative(this.root, file));
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
    .sort();
}

/** `data/browse.lock`: a JSON file with the pid and start time. */
export class FileLockStore implements LockStore {
  constructor(private readonly path: string) {}

  read(): LockInfo | null {
    try {
      const info = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<LockInfo>;
      return typeof info.pid === 'number' && typeof info.startedAt === 'number'
        ? { pid: info.pid, startedAt: info.startedAt }
        : null;
    } catch {
      return null;
    }
  }

  write(info: LockInfo): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(info));
  }

  remove(): void {
    rmSync(this.path, { force: true });
  }
}

/** Whether a process with this pid exists (EPERM means it does, owned by someone else). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The chat bot's knowledge base, read-only: every `.md` in a folder under it but `pending/` and `sources/`. */
export class FileKnowledgeSource implements KnowledgeSource {
  constructor(private readonly root: string) {}

  files(): KnowledgeFile[] {
    if (!existsSync(this.root)) return [];
    const out: KnowledgeFile[] = [];
    for (const dir of readdirSync(this.root, { withFileTypes: true })) {
      if (!dir.isDirectory() || dir.name === 'pending' || dir.name === 'sources') continue;
      for (const file of walk(join(this.root, dir.name))) {
        if (!file.endsWith('.md') || !statSync(file).isFile()) continue;
        out.push({
          folder: dir.name,
          file: relative(this.root, file),
          text: readFileSync(file, 'utf8'),
        });
      }
    }
    return out;
  }
}
