/**
 * Entry point: reads the options, builds the real objects and starts the bot.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DyhubClient } from '@dy-apps/services';
import { uvWorker } from './adapters/asr-worker';
import { ChatLog } from './adapters/chat-log-files';
import { claudeCli } from './adapters/claude-cli';
import { dyhubEvents } from './adapters/dyhub-events';
import { DyhubRoomApi } from './adapters/dyhub-room-api';
import { jsonFileStorage } from './adapters/wallet-file';
import { createLogger } from './adapters/winston-logger';
import { Billing } from './app/billing';
import { ChatBot } from './app/chat-bot';
import { Outbox } from './app/outbox';
import { Transcriber } from './app/transcriber';
import { parseCliOptions, USAGE } from './cli-options';
import { Transcript } from './core/transcript';
import { Wallet } from './core/wallet';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const options = parseCliOptions(process.argv.slice(2), packageDir);
if (!options) {
  console.error(USAGE);
  process.exit(1);
}
const { roomId, port } = options;

const log = createLogger(resolve(options.logsDir));
const room = new DyhubRoomApi(port, roomId);
const transcript = new Transcript();
// Balances last one run: cleared on exit, and on start in case the last run didn't exit cleanly.
const dataDir = resolve(options.dataDir);
const wallet = new Wallet(jsonFileStorage(join(dataDir, `wallet-${roomId}.json`)));
wallet.clear();
// Everything said, chatted and gifted, 100 records a file; Claude may read this folder.
const chatDir = join(dataDir, 'chat', roomId);
mkdirSync(chatDir, { recursive: true });
const record = new ChatLog(chatDir);
const transcriber = options.asr
  ? new Transcriber({
      streamUrl: room.streamUrl,
      transcript,
      record,
      log,
      spawnWorker: uvWorker(join(packageDir, 'asr')),
    })
  : null;
const bot = new ChatBot({
  events: dyhubEvents(new DyhubClient({ port, roomId, retryMs: 5000 })),
  bot: { nickname: options.botName, userId: options.botId },
  // An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
  ask: claudeCli({
    cwd: tmpdir(),
    tools: options.tools,
    readDirs: [chatDir],
    model: options.model,
    systemPrompt: options.systemPrompt,
  }),
  // Every reply and notice waits here, and goes out at least --send-interval seconds apart.
  outbox: new Outbox({ send: room.sendChat, log, intervalMs: options.sendIntervalMs }),
  screenshot: options.screenshot ? room.screenshot : undefined,
  transcript,
  transcriptMs: options.transcriptMs,
  record,
  billing: new Billing({ wallet, cost: options.cost }),
  maxPending: options.maxPending,
  log,
  promptTemplate: readFileSync(resolve(options.promptFile), 'utf8'),
  historySize: options.historySize,
  maxReplyLength: options.maxReplyLength,
  maxReplyParts: options.maxReplyParts,
});

log.info('starting', {
  roomId,
  port,
  botName: options.botName,
  asr: options.asr,
  screenshot: options.screenshot,
  cost: options.cost,
});
bot.start();
void transcriber?.run();

const shutdown = () => {
  log.info('stopping');
  bot.stop();
  transcriber?.stop();
  wallet.clear();
  log.on('finish', () => process.exit(0));
  log.end();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
