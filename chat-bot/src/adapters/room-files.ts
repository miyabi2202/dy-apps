import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Log, OnSingConfig } from '../app/ports';
import { errorMessage } from '../core/errors';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** Everything the bot sent in the room. */
  botTalk: string;
  /** Where each viewer's folder of exchanges with the bot goes. */
  users: string;
  /** The room's settings, see RoomConfig. */
  config: string;
}

/** What `room_config.json` says about a room. */
export interface RoomConfig {
  /** A 私密 room: its viewers hide who they are, and come in under one shared user id. */
  private: boolean;
  /** What the bot says, now and then, as the streamer starts a song (`on_sing`); none when absent. */
  onSing?: OnSingConfig;
}

/** The room's streamer, which the bot writes into `room_config.json` once it knows. */
export interface Streamer {
  uid: string;
  nickname: string;
}

const DEFAULT_ROOM_CONFIG: RoomConfig = { private: false };

/**
 * The room's files in `dir` (`data/<房间号>/`, which also holds `chat/` and `wallet.json`): an
 * empty `context.md` and a default `room_config.json` created when missing, `bot_logs.md`, and a `<user id>/` folder for each
 * viewer the bot talked with. The prompts are shared by every room (see PROMPT_FILES); a room
 * only has its own when someone puts one there to override it.
 */
export function roomFiles(dir: string): RoomFiles {
  mkdirSync(dir, { recursive: true });
  const files = {
    context: join(dir, 'context.md'),
    botTalk: join(dir, 'bot_logs.md'),
    users: dir,
    config: join(dir, 'room_config.json'),
  };
  if (!existsSync(files.context)) writeFileSync(files.context, '');
  if (!existsSync(files.config)) {
    writeFileSync(files.config, `${JSON.stringify(DEFAULT_ROOM_CONFIG, null, 2)}\n`);
  }
  return files;
}

/**
 * The room's `room_config.json` as it is now: read on each call, parsed again when it changed. A
 * file that can't be read or checked keeps the last good settings (the defaults at first).
 */
export function liveRoomConfig(
  path: string,
  { log, read = (p) => readFileSync(p, 'utf8') }: { log: Log; read?: (path: string) => string },
): () => RoomConfig {
  let config = DEFAULT_ROOM_CONFIG;
  let seen: string | null = null;
  return () => {
    try {
      const text = read(path);
      if (text === seen) return config;
      seen = text;
      const raw = JSON.parse(text) as { private?: unknown; on_sing?: unknown };
      const isPrivate = raw.private ?? false;
      if (typeof isPrivate !== 'boolean') throw new Error('private must be true or false');
      const onSing = raw.on_sing === undefined ? undefined : onSingConfig(raw.on_sing);
      config = { private: isPrivate, ...(onSing && { onSing }) };
      log.info('room config', { ...config });
    } catch (err) {
      log.warn('could not read room_config.json, keeping the last settings', {
        error: errorMessage(err),
      });
    }
    return config;
  };
}

/** `on_sing` as a OnSingConfig, or an error saying what's wrong with it. */
function onSingConfig(raw: unknown): OnSingConfig {
  const { message, probability } = (raw ?? {}) as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim()) {
    throw new Error('on_sing.message must be some text');
  }
  if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1)) {
    throw new Error('on_sing.probability must be a number from 0 to 1');
  }
  return { message, probability };
}

/**
 * Writes `streamer` into the room's `room_config.json` as `"streamer": { "nickname", "uid" }`,
 * keeping everything else in it. A file that doesn't parse is left alone.
 */
export function saveStreamer(
  path: string,
  { uid, nickname }: Streamer,
  {
    log,
    read = (p) => readFileSync(p, 'utf8'),
    write = writeFileSync,
  }: { log: Log; read?: (path: string) => string; write?: (path: string, text: string) => void },
): void {
  try {
    const config = JSON.parse(read(path)) as Record<string, unknown>;
    write(path, `${JSON.stringify({ ...config, streamer: { nickname, uid } }, null, 2)}\n`);
  } catch (err) {
    log.warn('could not write the streamer into room_config.json', { error: errorMessage(err) });
  }
}

/**
 * The prompt files in chat-bot/, by what they're for. A room overrides one with a file of the same
 * name in its folder, with `_` for `-`: `song-id.md` by `song_id.md`.
 */
export const PROMPT_FILES = {
  mention: 'prompt.md',
  replyPick: 'reply-pick.md',
  songId: 'song-id.md',
  giftThanks: 'gift-thanks.md',
  songIntro: 'song-intro.md',
  solve: 'solve.md',
} as const;

export type PromptName = keyof typeof PROMPT_FILES;

/**
 * The prompt `name`, read on every call so edits apply at once: the room's own file in `roomDir`
 * when there is one, else the shared one in `packageDir` (or `sharedPath`, for a prompt the command
 * line points elsewhere). Without `roomDir` the prompt has no room override. The shared file is read
 * once now, so a missing one stops the bot at start; it's also the text used if the shared file
 * can't be read later.
 */
export function livePrompt(
  name: PromptName,
  {
    packageDir,
    roomDir,
    sharedPath,
  }: { packageDir: string; roomDir?: string; sharedPath?: string },
): () => string {
  const file = PROMPT_FILES[name];
  const shared = sharedPath ?? join(packageDir, file);
  const first = readFileSync(shared, 'utf8');
  const sharedText = liveText(shared, () => first);
  if (!roomDir) return sharedText;
  return liveText(join(roomDir, file.replaceAll('-', '_')), sharedText);
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
