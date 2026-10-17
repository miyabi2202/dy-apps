import { readFileSync, statSync } from 'node:fs';
import type { Admins, Log } from '../app/ports';

/** The bot's settings that live in `config.json` rather than on the command line. */
export interface BotConfig {
  /** Douyin user ids of the admins. */
  admins: string[];
  /** Who the bot plays at start; commands can change it while it runs. */
  persona: string;
}

/** Reads and checks the config file; throws with what's wrong when it's unusable. */
export function readConfig(path: string, read = (p: string) => readFileSync(p, 'utf8')): BotConfig {
  const raw = JSON.parse(read(path)) as Partial<Record<keyof BotConfig, unknown>>;
  const admins = raw.admins ?? [];
  const persona = raw.persona ?? '';
  if (!isUserIdList(admins)) {
    throw new Error(`${path}: admins must be a list of user ids, like ["7664182420958889017"]`);
  }
  if (typeof persona !== 'string') throw new Error(`${path}: persona must be a string`);
  return { admins, persona };
}

function isUserIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && /^\d+$/.test(id));
}

export interface LiveAdminsOptions {
  log: Log;
  read?: (path: string) => string;
  /** When the file last changed. */
  modifiedAt?: (path: string) => number;
}

/**
 * The config file's admins, read again whenever the file changes, so admins can be added or
 * removed while the bot runs. A file that can't be read or checked keeps the last good list.
 */
export function liveAdmins(
  path: string,
  { log, read, modifiedAt = (p) => statSync(p).mtimeMs }: LiveAdminsOptions,
): Admins {
  let admins = new Set<string>();
  let seen: number | null = null;
  const refresh = () => {
    try {
      const changed = modifiedAt(path);
      if (changed === seen) return;
      seen = changed;
      const next = new Set(readConfig(path, read).admins);
      if (next.size !== admins.size || [...next].some((id) => !admins.has(id))) {
        log.info('admins', { admins: [...next] });
      }
      admins = next;
    } catch (err) {
      log.warn('could not read the admins, keeping the last ones', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  refresh();
  return {
    has(userId) {
      refresh();
      return admins.has(userId);
    },
  };
}
