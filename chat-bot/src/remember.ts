/**
 * Reads the room's chat record since last time into what the bot remembers (see RememberChat):
 * each regular's note.md, the room's memory.md and the streamer's note. Run after a stream, with
 * the same options as the bot:
 *
 *     pnpm remember --room 259175310675 --bot-name 默认关闭 --bot-id 7692586790687114297
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './adapters/winston-logger';
import { parseCliOptions, USAGE } from './cli-options';
import { errorMessage } from './core/errors';
import { buildContainer, REMEMBER_CHAT } from './wiring';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(packageDir, '.env'))) process.loadEnvFile(join(packageDir, '.env'));

const options = parseCliOptions(process.argv.slice(2), packageDir);
if (!options) {
  console.error(USAGE);
  process.exit(1);
}

const log = createLogger(resolve(options.logsDir));
let code = 0;
try {
  await buildContainer({ options, packageDir, log, env: process.env }).resolve(REMEMBER_CHAT).run();
} catch (err) {
  log.error('could not remember', { error: errorMessage(err) });
  code = 1;
}
log.on('finish', () => process.exit(code));
log.end();
