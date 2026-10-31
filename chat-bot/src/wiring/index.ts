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
import { ENV, FEATURES, LOG, OPTIONS, PACKAGE_DIR, PROMPTS_DIR } from './tokens';
import { registerTranscriber } from './transcriber';

export { APP, BOT, REMEMBER_CHAT } from './tokens';
export type { App } from './app';

/** What the entry gives the container: the command line, where the package is, the log, the environment. */
export interface Given {
  options: CliOptions;
  packageDir: string;
  log: Log;
  env: { JEV_API_KEY?: string };
}

/**
 * A container with the whole bot registered, and nothing made yet: resolve APP for the bot, or
 * register fakes for the adapters (see adapters.ts) first, to build it without the outside world.
 */
export function buildContainer({ options, packageDir, log, env }: Given): Container {
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
  return container;
}
