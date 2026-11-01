import { parseKnowledge } from '../core/knowledge';
import type { DataStore } from './ports';

const STILL_RIGHT = 'still-right-';

/** Where chat-bot's knowledge drafts wait for review, under its `data/`. */
export const PENDING_DIR = 'knowledge/pending';

/**
 * Where knowledge drafts go: chat-bot's `data/knowledge/pending/` (`store` is the chat bot's
 * `data/`): `<folder>/<date>.md` for drafts (entries, to be reviewed like every other draft there),
 * and `still-right-<date>.md` for a plain list of entries found still right. Nothing here writes
 * the live knowledge base.
 */
export class DraftStore {
  constructor(
    private readonly data: DataStore,
    private readonly pendingDir: string = PENDING_DIR,
  ) {}

  /** Appends entries (already formatted) to the folder's file for the day. */
  addDrafts(folder: string, date: string, entries: readonly string[]): string {
    const path = `${this.pendingDir}/${folder}/${date}.md`;
    const existing = this.data.read(path);
    const text = entries.join('\n\n') + '\n';
    this.data.write(path, existing ? `${existing.trimEnd()}\n\n${text}` : text);
    return path;
  }

  /** Adds to the day's list of entries found still right, each once. */
  addStillRight(
    date: string,
    entries: readonly { folder: string; title: string }[],
  ): string | null {
    if (!entries.length) return null;
    const path = `${this.pendingDir}/${STILL_RIGHT}${date}.md`;
    const existing = this.data.read(path);
    const have = new Set((existing ?? '').split('\n'));
    const lines = entries.map((e) => `- ${e.folder}/${e.title}`).filter((line) => !have.has(line));
    if (!lines.length) return path;
    const head = existing?.trimEnd() ?? '# 仍然正确（只需把复查日期往后挪，不用改内容）\n';
    this.data.write(path, `${head}\n${lines.join('\n')}\n`);
    return path;
  }

  /** Headings and aliases (lowercase) of every draft not yet reviewed: the files in `pending/<folder>/`. */
  pendingNames(): Set<string> {
    const names = new Set<string>();
    const depth = this.pendingDir.split('/').length;
    for (const path of this.data.list(this.pendingDir)) {
      const parts = path.split('/');
      if (parts.length < depth + 2 || !path.endsWith('.md')) continue;
      for (const entry of parseKnowledge(this.data.read(path) ?? '')) {
        for (const name of [entry.title, ...entry.aliases]) names.add(name.toLowerCase());
      }
    }
    return names;
  }
}
