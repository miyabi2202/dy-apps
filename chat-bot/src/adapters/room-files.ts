import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** This room's own prompt for what the bot says unprompted, if someone writes one. */
  autoReply: string;
  /** This room's own prompt for /识歌, if someone writes one. */
  songId: string;
  /** This room's own prompt for thanking big givers, if someone writes one. */
  giftThanks: string;
  /** Everything the bot sent in the room. */
  botTalk: string;
  /** A folder of each viewer's exchanges with the bot. */
  users: string;
}

/**
 * The room's files in `dir`, with an empty `context.md` created when missing. The prompts are
 * shared by every room (chat-bot/talk.md and so on); a room only has its own `auto_reply.md`,
 * `song_id.md` or `gift_thanks.md` when someone puts one there to override it.
 */
export function roomFiles(dir: string): RoomFiles {
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
