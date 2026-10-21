import type { CliOptions } from '../cli-options';
import type { Log } from '../app/ports';
import { registerAdapters } from './adapters';
import { registerApp } from './app';
import { registerAutoReply } from './auto-reply';
import { registerBot } from './bot';
import { Container } from './container';
import { registerMalice } from './malice';
import { registerModels } from './models';
import { registerRoom } from './room';
import { registerSongs } from './songs';
import { join } from 'node:path';
import { ENV, LOG, OPTIONS, PACKAGE_DIR, PROMPTS_DIR } from './tokens';
import { registerTranscriber } from './transcriber';

export { APP, BOT } from './tokens';
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
  registerAdapters(container);
  registerModels(container);
  registerRoom(container);
  registerAutoReply(container);
  registerSongs(container);
  registerMalice(container);
  registerTranscriber(container);
  registerBot(container);
  registerApp(container);
  return container;
}
