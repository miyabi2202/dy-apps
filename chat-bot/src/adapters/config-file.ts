import { readFileSync } from 'node:fs';

/** The bot's settings that live in `config.json` rather than on the command line. */
export interface BotConfig {
  /** Douyin user ids of the admins. */
  admins: string[];
  /** Who the bot plays at start; admins can change it while it runs. */
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
