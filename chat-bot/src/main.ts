/**
 * Entry point: reads the options, builds the real objects and starts the bot.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DyhubClient, isRoomId, parsePort } from '@dy-apps/services';
import { ChatBot } from './chat-bot';
import { claudeCli } from './claude';
import { dyhubChat } from './dyhub-chat';
import { createLogger } from './logger';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    room: { type: 'string' },
    port: { type: 'string', default: '8757' },
    'bot-name': { type: 'string' },
    'bot-id': { type: 'string' },
    prompt: { type: 'string', default: join(packageDir, 'prompt.md') },
    history: { type: 'string', default: '100' },
    'max-reply': { type: 'string', default: '49' },
    tools: { type: 'string', default: 'WebSearch' },
    logs: { type: 'string', default: join(packageDir, 'logs') },
  },
});

const roomId = values.room ?? '';
const port = parsePort(values.port);
const botName = values['bot-name'];
if (!isRoomId(roomId) || port === null || !botName) {
  console.error(
    'Usage: pnpm start --room <房间号> --bot-name <机器人账号昵称> [--bot-id <账号 uid>] [--port 8757]\n' +
      '       [--prompt prompt.md] [--history 100] [--max-reply 49] [--tools WebSearch] [--logs logs/]',
  );
  process.exit(1);
}

const log = createLogger(resolve(values.logs));
const bot = new ChatBot({
  client: new DyhubClient({ port, roomId, retryMs: 5000 }),
  bot: { nickname: botName, userId: values['bot-id'] },
  // An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
  ask: claudeCli({ cwd: tmpdir(), tools: values.tools.split(',').filter(Boolean) }),
  send: dyhubChat(port, roomId),
  log,
  promptTemplate: readFileSync(resolve(values.prompt), 'utf8'),
  historySize: Number(values.history),
  maxReplyLength: Number(values['max-reply']),
});

log.info('starting', { roomId, port, botName });
bot.start();

const shutdown = () => {
  log.info('stopping');
  bot.stop();
  log.on('finish', () => process.exit(0));
  log.end();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
