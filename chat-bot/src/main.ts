/**
 * Entry point: reads the options, builds the bot (see wiring/) and starts it.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './adapters/winston-logger';
import { parseCliOptions, USAGE } from './cli-options';
import { APP, buildContainer } from './wiring';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// API keys (JEV_API_KEY) from chat-bot/.env, which git ignores, when there is one.
if (existsSync(join(packageDir, '.env'))) process.loadEnvFile(join(packageDir, '.env'));

const options = parseCliOptions(process.argv.slice(2), packageDir);
if (!options) {
  console.error(USAGE);
  process.exit(1);
}

const log = createLogger(resolve(options.logsDir));
const app = buildContainer({ options, packageDir, log, env: process.env }).resolve(APP);
const shutdown = (options?: { quitSpeech?: boolean }) => {
  app.stop(options);
  log.on('finish', () => process.exit(0));
  log.end();
};
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
// room-feed exits when the stream has ended (or its page showed another room): so does the bot,
// and the speech service with it.
app.onRoomFeedGone((detail) => {
  log.warn('room-feed is gone, stopping', detail ? { detail } : {});
  shutdown({ quitSpeech: true });
});
await app.start();
