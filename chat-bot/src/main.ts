/**
 * Entry point: reads the options, builds the real objects and starts the bot.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DyhubClient, isRoomId, parsePort } from '@dy-apps/services';
import { ChatBot } from './chat-bot';
import { ChatLog } from './chat-log';
import { claudeCli } from './claude';
import { DyhubRoomApi } from './dyhub-room';
import { createLogger } from './logger';
import { Outbox } from './outbox';
import { Transcriber, uvWorker } from './transcriber';
import { Transcript } from './transcript';
import { jsonFileStorage, Wallet } from './wallet';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  allowNegative: true,
  options: {
    room: { type: 'string' },
    port: { type: 'string', default: '8757' },
    'bot-name': { type: 'string' },
    'bot-id': { type: 'string' },
    prompt: { type: 'string', default: join(packageDir, 'prompt.md') },
    history: { type: 'string', default: '100' },
    'max-reply': { type: 'string', default: '49' },
    tools: { type: 'string', default: 'WebSearch,Read,Glob,Grep' },
    model: { type: 'string', default: 'opus' },
    system: { type: 'string', default: '你是一个抖音直播间的机器人' },
    logs: { type: 'string', default: join(packageDir, 'logs') },
    asr: { type: 'boolean', default: true },
    'transcript-minutes': { type: 'string', default: '5' },
    screenshot: { type: 'boolean', default: true },
    cost: { type: 'string', default: '1' },
    queue: { type: 'string', default: '20' },
    'send-interval': { type: 'string', default: '10' },
    data: { type: 'string', default: join(packageDir, 'data') },
  },
});

const roomId = values.room ?? '';
const port = parsePort(values.port);
const botName = values['bot-name'];
if (!isRoomId(roomId) || port === null || !botName) {
  console.error(
    'Usage: pnpm start --room <房间号> --bot-name <机器人账号昵称> [--bot-id <账号 uid>] [--port 8757]\n' +
      '       [--prompt prompt.md] [--history 100] [--max-reply 49] [--tools WebSearch,Read,Glob,Grep]\n' +
      '       [--model opus] [--system <系统提示>] [--logs logs/]\n' +
      '       [--no-asr] [--transcript-minutes 5] [--no-screenshot] [--cost 1] [--queue 20]\n' +
      '       [--send-interval 10] [--data data/]',
  );
  process.exit(1);
}

const log = createLogger(resolve(values.logs));
const room = new DyhubRoomApi(port, roomId);
const transcript = new Transcript();
// Balances last one run: cleared on exit, and on start in case the last run didn't exit cleanly.
const dataDir = resolve(values.data);
const wallet = new Wallet(jsonFileStorage(join(dataDir, `wallet-${roomId}.json`)));
wallet.clear();
// Everything said, chatted and gifted, 100 records a file; Claude may read this folder.
const chatDir = join(dataDir, 'chat', roomId);
mkdirSync(chatDir, { recursive: true });
const chatLog = new ChatLog(chatDir);
const transcriber = values.asr
  ? new Transcriber({
      streamUrl: room.streamUrl,
      transcript,
      chatLog,
      log,
      spawnWorker: uvWorker(join(packageDir, 'asr')),
    })
  : null;
const bot = new ChatBot({
  client: new DyhubClient({ port, roomId, retryMs: 5000 }),
  bot: { nickname: botName, userId: values['bot-id'] },
  // An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
  ask: claudeCli({
    cwd: tmpdir(),
    tools: values.tools.split(',').filter(Boolean),
    readDirs: [chatDir],
    model: values.model,
    systemPrompt: values.system,
  }),
  // Every reply and notice waits here, and goes out at least --send-interval seconds apart.
  outbox: new Outbox({
    send: room.sendChat,
    log,
    intervalMs: Number(values['send-interval']) * 1000,
  }),
  screenshot: values.screenshot ? room.screenshot : undefined,
  transcript,
  transcriptMs: Number(values['transcript-minutes']) * 60_000,
  chatLog,
  wallet,
  cost: Number(values.cost),
  maxPending: Number(values.queue),
  log,
  promptTemplate: readFileSync(resolve(values.prompt), 'utf8'),
  historySize: Number(values.history),
  maxReplyLength: Number(values['max-reply']),
});

log.info('starting', {
  roomId,
  port,
  botName,
  asr: values.asr,
  screenshot: values.screenshot,
  cost: Number(values.cost),
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
