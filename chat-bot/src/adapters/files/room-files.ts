import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Log } from '../../app/ports';
import { errorMessage } from '../../core/errors';
import { DEFAULT_ROOM_CONFIG, roomConfigFrom, type RoomConfig } from '../../core/room/room-config';
import type { Settings } from '../../core/commands/settings';
import { writeTextAtomic } from './atomic-file';

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

/** The room's streamer, which the bot writes into `room_config.json` once it knows. */
export interface Streamer {
  uid: string;
  nickname: string;
}

/**
 * The room's files in `dir` (`data/<房间号>/`, which also holds `chat/`): an empty `context.md`
 * and a default `room_config.json` created when missing, `bot_logs.md`, and a `<user id>/` folder
 * for each viewer the bot talked with. The prompts are shared by every room (see PROMPT_FILES in prompt-files.ts); a room
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
  let config: RoomConfig = DEFAULT_ROOM_CONFIG;
  let seen: string | null = null;
  const load = (text: string) => {
    seen = text;
    const raw = JSON.parse(text) as Record<string, unknown>;
    const problems: string[] = [];
    config = roomConfigFrom(raw, config, problems);
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
 * Fills in `room_config.json` at start so it has every field (see DEFAULT_ROOM_CONFIG): one that's missing
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
  const defaults: Record<string, unknown> = { ...DEFAULT_ROOM_CONFIG };
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
