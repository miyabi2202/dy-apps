import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** The prompt for what the bot says unprompted. */
  autoReply: string;
  /** The prompt for /识歌. */
  songId: string;
  /** The prompt for thanking big givers. */
  giftThanks: string;
  /** Everything the bot sent in the room. */
  botTalk: string;
  /** A folder of each viewer's exchanges with the bot. */
  users: string;
}

/**
 * The room's files in `dir`, the editable ones created when missing: an empty `context.md`, and
 * `auto_reply.md`, `song_id.md` and `gift_thanks.md` as copies of the defaults to start from.
 */
export function roomFiles(
  dir: string,
  defaults: { autoReply: string; songId: string; giftThanks: string },
): RoomFiles {
  mkdirSync(dir, { recursive: true });
  const files = {
    context: join(dir, 'context.md'),
    autoReply: join(dir, 'auto_reply.md'),
    songId: join(dir, 'song_id.md'),
    giftThanks: join(dir, 'gift_thanks.md'),
    botTalk: join(dir, 'bot_talk.txt'),
    users: join(dir, 'users'),
  };
  if (!existsSync(files.context)) writeFileSync(files.context, '');
  if (!existsSync(files.autoReply)) copyFileSync(defaults.autoReply, files.autoReply);
  if (!existsSync(files.songId)) copyFileSync(defaults.songId, files.songId);
  if (!existsSync(files.giftThanks)) copyFileSync(defaults.giftThanks, files.giftThanks);
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
