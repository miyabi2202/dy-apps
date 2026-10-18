import { readFileSync } from 'node:fs';
import type { Admins, Log } from '../app/ports';
import { errorMessage } from '../core/errors';
import { HIDDEN_ID, isHiddenViewer } from './dyhub-events';

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
}

/**
 * The config file's admins, so admins can be added or removed while the bot runs: each check
 * reads the file (it's tiny, and checks only come with mentions) and parses it again when its
 * text differs from last time. A file that can't be read or checked keeps the last good list.
 * Listing `111111` makes every 私密 room viewer an admin, for running a command there (Douyin hides
 * admins' ids too) before taking it out again.
 */
export function liveAdmins(
  path: string,
  { log, read = (p) => readFileSync(p, 'utf8') }: LiveAdminsOptions,
): Admins {
  let admins = new Set<string>();
  let seen: string | null = null;
  const refresh = () => {
    try {
      const text = read(path);
      if (text === seen) return;
      seen = text;
      const next = new Set(readConfig(path, () => text).admins);
      if (next.size !== admins.size || [...next].some((id) => !admins.has(id))) {
        log.info('admins', { admins: [...next] });
      }
      admins = next;
    } catch (err) {
      log.warn('could not read the admins, keeping the last ones', {
        error: errorMessage(err),
      });
    }
  };
  refresh();
  return {
    has(userId) {
      refresh();
      return admins.has(userId) || (admins.has(HIDDEN_ID) && isHiddenViewer(userId));
    },
  };
}
