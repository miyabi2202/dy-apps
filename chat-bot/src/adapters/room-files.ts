import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Log, OnSingConfig } from '../app/ports';
import { errorMessage } from '../core/errors';
import { DEFAULT_TIME_ZONE, isTimeZone } from '../core/local-time';
import { SETTING_DEFAULTS, settingsFrom, type Settings } from '../core/settings';
import { wordingOf, type Wording } from '../core/wording';
import { writeTextAtomic } from './atomic-file';

/** The files someone can edit for one room, to change the bot there while it runs. */
export interface RoomFiles {
  /** Background on the room, for the prompts' `{{context}}`. */
  context: string;
  /** Who the bot plays, for `{{persona}}`; /修改人设 writes it. */
  persona: string;
  /** Everything the bot sent in the room. */
  botTalk: string;
  /** Where each viewer's folder of exchanges with the bot goes. */
  users: string;
  /** The room's settings, see RoomConfig. */
  config: string;
}

/** What `room_config.json` says about a room. */
export interface RoomConfig extends Settings {
  /** A 私密 room: its viewers hide who they are, and come in under one shared user id. */
  private: boolean;
  /** What the bot says, now and then, as the streamer starts a song (`on_sing`); none when absent. */
  onSing?: OnSingConfig;
  /** Other names viewers and the streamer call the bot (`aliases`), as speech recognition may write them. */
  aliases: string[];
  /** What to take off the start of a nickname when the bot @s someone (`atTrimStart`): 单推符号. */
  atTrimStart: string[];
  /**
   * Where the streamer is (`timeZone`, an IANA name like `Asia/Shanghai`): every time the models
   * and the records show is in it. Beijing time when not known.
   */
  timeZone: string;
}

/** The room's streamer, which the bot writes into `room_config.json` once it knows. */
export interface Streamer {
  uid: string;
  nickname: string;
}

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  private: false,
  aliases: [],
  atTrimStart: [],
  timeZone: DEFAULT_TIME_ZONE,
  ...SETTING_DEFAULTS,
};

/** Every field a room's room_config.json is filled in with (see fillRoomConfig), and its default. */
const ROOM_FIELDS = {
  private: false,
  aliases: [],
  atTrimStart: [],
  timeZone: DEFAULT_TIME_ZONE,
  ...SETTING_DEFAULTS,
};

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
    persona: join(dir, 'persona.md'),
    botTalk: join(dir, 'bot_logs.md'),
    users: dir,
    config: join(dir, 'room_config.json'),
  };
  if (!existsSync(files.context)) writeFileSync(files.context, '');
  if (!existsSync(files.config)) {
    writeFileSync(files.config, `${JSON.stringify({ private: false }, null, 2)}\n`);
  }
  return files;
}

/**
 * The room's `room_config.json`, read hot: `get()` reads the file on each call and parses it again
 * when it changed (a file that can't be read or checked keeps the last good settings, the defaults
 * at first), so a hand edit takes effect at once. `update(patch)` writes fields into the file,
 * keeping every other field, and the next `get()` already has them: nothing reloads, so nothing
 * flaps.
 */
export function roomConfigFile(
  path: string,
  {
    log,
    read = (p) => readFileSync(p, 'utf8'),
    write = writeTextAtomic,
  }: {
    log: Log;
    read?: (path: string) => string;
    write?: (path: string, text: string) => void;
  },
): { get(): RoomConfig; update(patch: Record<string, unknown>): void } {
  let config = DEFAULT_ROOM_CONFIG;
  let seen: string | null = null;
  const load = (text: string) => {
    seen = text;
    const raw = JSON.parse(text) as Record<string, unknown>;
    // Each field is checked on its own: a bad one keeps its last good value, so a typo in one
    // setting can't, say, turn a 私密 room's `private` off with it.
    const problems: string[] = [];
    const field = <T>(name: string, parse: () => T, last: T): T => {
      try {
        return parse();
      } catch (err) {
        problems.push(`${name}: ${errorMessage(err)}`);
        return last;
      }
    };
    const isPrivate = field(
      'private',
      () => {
        const value = raw.private ?? false;
        if (typeof value !== 'boolean') throw new Error('must be true or false');
        return value;
      },
      config.private,
    );
    const onSing = field(
      'on_sing',
      () => (raw.on_sing === undefined ? undefined : onSingConfig(raw.on_sing)),
      config.onSing,
    );
    config = {
      private: isPrivate,
      ...(onSing && { onSing }),
      aliases: field('aliases', () => aliasList(raw.aliases), config.aliases),
      atTrimStart: field('atTrimStart', () => prefixList(raw.atTrimStart), config.atTrimStart),
      timeZone: field('timeZone', () => timeZoneOf(raw.timeZone), config.timeZone),
      ...settingsFrom(raw, config, problems),
    };
    if (problems.length)
      log.warn('room_config.json has bad values, keeping their last ones', { problems });
    log.info('room config', { ...config });
  };
  return {
    get() {
      try {
        const text = read(path);
        if (text !== seen) load(text);
      } catch (err) {
        log.warn('could not read room_config.json, keeping the last settings', {
          error: errorMessage(err),
        });
      }
      return config;
    },
    update(patch) {
      let current: Record<string, unknown>;
      try {
        current = JSON.parse(read(path)) as Record<string, unknown>;
      } catch (err) {
        // Mid hand-edit, say: leave the file to whoever is editing it.
        log.warn('could not change room_config.json', { patch, error: errorMessage(err) });
        return;
      }
      const text = `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`;
      // Checked before it's written, so a change can't make the file unreadable.
      load(text);
      write(path, text);
    },
  };
}

/**
 * The room's `room_config.json` as it is now (see roomConfigFile): read on each call, parsed again
 * when it changed.
 */
export function liveRoomConfig(
  path: string,
  options: { log: Log; read?: (path: string) => string },
): () => RoomConfig {
  const file = roomConfigFile(path, options);
  return () => file.get();
}

/**
 * Fills in `room_config.json` at start so it has every field (see ROOM_FIELDS): one that's missing
 * is written with the command-line option `given` for it, else its default. One that's there wins
 * over an option (the file is the room's memory: a restart with other options keeps it), with a
 * warning when a given option differs. Other fields (`on_sing`, `download`, `streamer`…) stay as they
 * are, and the file is written (atomically) only when something was missing. One that isn't JSON is
 * left alone.
 */
export function fillRoomConfig(
  path: string,
  given: Partial<Settings>,
  {
    log,
    read = (p) => readFileSync(p, 'utf8'),
    write = writeTextAtomic,
  }: {
    log: Log;
    read?: (path: string) => string;
    write?: (path: string, text: string) => void;
  },
): void {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(read(path)) as Record<string, unknown>;
  } catch (err) {
    log.warn('could not fill in room_config.json', { error: errorMessage(err) });
    return;
  }
  const filled: Record<string, unknown> = { ...raw };
  const defaults: Record<string, unknown> = { ...ROOM_FIELDS };
  for (const [field, fallback] of Object.entries(defaults)) {
    const option = (given as Record<string, unknown>)[field];
    if (raw[field] === undefined) {
      filled[field] = option ?? fallback;
    } else if (option !== undefined && option !== raw[field]) {
      log.warn('setting from room_config, ignoring option', { field, config: raw[field], option });
    }
  }
  if (Object.keys(filled).length === Object.keys(raw).length) return;
  write(path, `${JSON.stringify(filled, null, 2)}\n`);
}

/** `timeZone` as a time zone this machine knows (Beijing time when absent), or an error. */
function timeZoneOf(raw: unknown): string {
  if (raw === undefined) return DEFAULT_TIME_ZONE;
  if (typeof raw !== 'string' || !isTimeZone(raw)) {
    throw new Error('timeZone must be a time zone like "Asia/Shanghai" or "America/New_York"');
  }
  return raw;
}

/** `atTrimStart` as a list of prefixes (none when absent), or an error saying what's wrong with it. */
function prefixList(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((prefix) => typeof prefix === 'string')) {
    throw new Error('atTrimStart must be a list of what to take off nicknames, like ["⊹꙳𝝑"]');
  }
  return raw.filter((prefix) => prefix.trim());
}

/** `aliases` as a list of names (none when absent), or an error saying what's wrong with it. */
function aliasList(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((name) => typeof name === 'string')) {
    throw new Error('aliases must be a list of names, like ["Fairy", "菲瑞"]');
  }
  return raw.map((name) => name.trim()).filter(Boolean);
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
    write = writeTextAtomic,
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
  malice: 'malice.md',
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

/**
 * The wording in `path` (wording.md), read on every use like a prompt so edits apply at once. The
 * file is read once now, so a missing one stops the bot at start; it's also the text used if it
 * can't be read later.
 */
export function liveWording(path: string): Wording {
  const first = readFileSync(path, 'utf8');
  return wordingOf(liveText(path, () => first));
}
