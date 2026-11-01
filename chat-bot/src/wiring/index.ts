import type { CliOptions } from '../cli-options';
import type { Log } from '../app/ports';
import { registerAdapters } from './adapters';
import { registerApp } from './app';
import { registerAutoReply } from './auto-reply';
import { registerBot } from './bot';
import { Container } from './container';
import { registerLife } from './life';
import { registerMalice } from './malice';
import { registerMcp } from './mcp';
import { registerModels } from './models';
import { registerRoom } from './room';
import { registerSongs } from './songs';
import { join } from 'node:path';
import { FeatureRegistry } from './features';
import { saveAccount } from '../adapters/files/room-files';
import type { BotAccount } from '../app/ports';
import {
  BOT_ACCOUNT,
  ENV,
  FEATURES,
  LOG,
  OPTIONS,
  PACKAGE_DIR,
  PROMPTS_DIR,
  ROOM_CONFIG,
  ROOM_FILES,
} from './tokens';
import { registerTranscriber } from './transcriber';

export { APP, REMEMBER_CHAT } from './tokens';

/**
 * What the entry gives the container: the command line, the bot's own account (as room-feed said;
 * from the room's room_config.json when not given), where the package is, the log, the environment.
 */
export interface Given {
  options: CliOptions;
  bot?: BotAccount;
  packageDir: string;
  log: Log;
  env: { JEV_API_KEY?: string };
}

/**
 * A container with the whole bot registered, and nothing made yet: resolve APP for the bot, or
 * register fakes for the adapters (see adapters.ts) first, to build it without the outside world.
 */
export function buildContainer({ options, bot, packageDir, log, env }: Given): Container {
  const container = new Container()
    .register(OPTIONS, () => options)
    .register(PACKAGE_DIR, () => packageDir)
    .register(PROMPTS_DIR, () => join(packageDir, 'prompts'))
    .register(LOG, () => log)
    .register(ENV, () => env);
  const features = new FeatureRegistry();
  registerAdapters(container);
  registerModels(container);
  registerRoom(container, features);
  registerAutoReply(container, features);
  registerSongs(container, features);
  registerMalice(container, features);
  registerLife(container, features);
  registerTranscriber(container);
  registerMcp(container);
  registerBot(container);
  container.register(FEATURES, (c) => features.build(c));
  registerApp(container);
  // The account room-feed said is kept in room_config.json, for `pnpm remember` after the stream.
  container.register(BOT_ACCOUNT, (c) => {
    if (bot) {
      saveAccount(c.resolve(ROOM_FILES).config, 'bot', bot, { log });
      return bot;
    }
    const saved = c.resolve(ROOM_CONFIG)().bot;
    if (!saved) {
      throw new Error(
        "the bot's account isn't known: start the bot with room-feed once, which says which account it's logged in as",
      );
    }
    return saved;
  });
  return container;
}
