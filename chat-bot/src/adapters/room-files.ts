import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** This room's own prompt for what the bot says unprompted, if someone writes one. */
  autoReply: string;
  /** This room's own prompts for /识歌, Claude's and the web-searching models', and for /识冷门歌, if someone writes one. */
  songId: string;
  songIdWeb: string;
  songIdRare: string;
  /** This room's own prompt for thanking big givers, if someone writes one. */
  giftThanks: string;
  /** Everything the bot sent in the room. */
  botTalk: string;
  /** Where each viewer's folder of exchanges with the bot goes. */
  users: string;
}

/**
 * The room's files in `dir` (`data/<房间号>/`, which also holds `chat/` and `wallet.json`): an
 * empty `context.md` created when missing, `bot_logs.md`, and a `<user id>/` folder for each
 * viewer the bot talked with. The prompts are shared by every room (chat-bot/talk.md and so on);
 * a room only has its own `auto_reply.md`, `song_id.md`, `song_id_web.md`, `song_id_rare.md` or `gift_thanks.md`
 * when someone puts one there to override it.
 */
export function roomFiles(dir: string): RoomFiles {
  mkdirSync(dir, { recursive: true });
  const files = {
    context: join(dir, 'context.md'),
    autoReply: join(dir, 'auto_reply.md'),
    songId: join(dir, 'song_id.md'),
    songIdWeb: join(dir, 'song_id_web.md'),
    songIdRare: join(dir, 'song_id_rare.md'),
    giftThanks: join(dir, 'gift_thanks.md'),
    botTalk: join(dir, 'bot_logs.md'),
    users: dir,
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

/**
 * The `## heading` section of a Markdown file, heading included, read each time it's called like
 * liveText; empty when the file or the section is missing.
 */
export function liveSection(path: string, heading: string): () => string {
  const read = liveText(path);
  return () => {
    const text = `\n${read()}`;
    const start = text.indexOf(`\n## ${heading}\n`);
    if (start < 0) return '';
    const end = text.indexOf('\n## ', start + 1);
    return text.slice(start, end < 0 ? undefined : end).trim();
  };
}
