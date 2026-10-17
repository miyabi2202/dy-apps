import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** The prompt for what the bot says unprompted. */
  autoReply: string;
}

/**
 * The room's files in `dir`, created when missing: an empty `context.md`, and `auto_reply.md`
 * as a copy of `defaultAutoReply` to start from.
 */
export function roomFiles(dir: string, defaultAutoReply: string): RoomFiles {
  mkdirSync(dir, { recursive: true });
  const files = { context: join(dir, 'context.md'), autoReply: join(dir, 'auto_reply.md') };
  if (!existsSync(files.context)) writeFileSync(files.context, '');
  if (!existsSync(files.autoReply)) copyFileSync(defaultAutoReply, files.autoReply);
  return files;
}

/**
 * Reads `path` each time it's called, so edits apply at once; `fallback` when it can't be read
 * (deleted, say).
 */
export function liveText(path: string, fallback: () => string = () => ''): () => string {
  return () => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return fallback();
    }
  };
}
