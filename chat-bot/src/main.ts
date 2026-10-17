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
import { liveAdmins, readConfig } from './adapters/config-file';
import { dyhubEvents } from './adapters/dyhub-events';
import { DyhubRoomApi } from './adapters/dyhub-room-api';
import { liveText, roomFiles } from './adapters/room-files';
import { botTalkFile, userTalkFiles } from './adapters/room-talk-files';
import { jsonFileStorage } from './adapters/wallet-file';
import { createLogger } from './adapters/winston-logger';
import { Billing } from './app/billing';
import { ChatBot } from './app/chat-bot';
import { GiftThanker } from './app/gift-thanker';
import { Outbox } from './app/outbox';
import { personaCommand, RoomState } from './app/room-state';
import { songIdCommand } from './app/song-id-command';
import { Talker } from './app/talker';
import { Transcriber } from './app/transcriber';
import { parseCliOptions, USAGE } from './cli-options';
import { ChatHistory } from './core/chat-history';
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
const config = readConfig(resolve(options.configFile));
const roomApi = new DyhubRoomApi(port, roomId);
const transcript = new Transcript();
// Everything about the room lives in data/<房间号>/ (see roomFiles).
const roomDir = join(resolve(options.dataDir), roomId);
// Balances last one run: cleared on exit, and on start in case the last run didn't exit cleanly.
const wallet = new Wallet(jsonFileStorage(join(roomDir, 'wallet.json')));
wallet.clear();
// Everything said, chatted and gifted, 100 records a file; Claude may read this folder.
const chatDir = join(roomDir, 'chat');
mkdirSync(chatDir, { recursive: true });
const record = new ChatLog(chatDir);
// The prompts are shared by every room (a room's own auto_reply.md, song_id.md or gift_thanks.md
// overrides one), and the room's context.md; all read on every use so edits apply while it runs.
// Plus what the bot said, overall and to each viewer, so it doesn't repeat itself.
const talkTemplate = resolve(options.talkPromptFile);
const songIdTemplate = join(packageDir, 'song-id.md');
const giftThanksTemplate = join(packageDir, 'gift-thanks.md');
const files = roomFiles(roomDir);
const context = liveText(files.context);
const botTalk = botTalkFile(files.botTalk);
const userTalk = userTalkFiles(files.users);
const transcriber = options.asr
  ? new Transcriber({
      streamUrl: roomApi.streamUrl,
      transcript,
      record,
      log,
      spawnWorker: uvWorker(join(packageDir, 'asr')),
    })
  : null;
const billing = new Billing({ wallet, cost: options.cost });
// An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
const ask = claudeCli({
  cwd: tmpdir(),
  tools: options.tools,
  readDirs: [chatDir],
  model: options.model,
  systemPrompt: options.systemPrompt,
});
// Every message the bot sends waits here, and goes out at least --send-interval seconds apart.
const outbox = new Outbox({
  send: roomApi.sendChat,
  log,
  intervalMs: options.sendIntervalMs,
  onSent: ({ text }) => botTalk.add(text),
});
// The mention prompt is read at start, so a missing file stops the bot at once, and then on every
// use; a read that fails later keeps the text from the start.
const mentionPrompt = resolve(options.promptFile);
const firstMentionTemplate = readFileSync(mentionPrompt, 'utf8');
const mentionTemplate = liveText(mentionPrompt, () => firstMentionTemplate);
const history = new ChatHistory(options.historySize);
// What the room looks like now, for every prompt. The bot plays config.persona until
// /修改人设 changes it for this run.
const room = new RoomState({
  history,
  transcript,
  transcriptMs: options.transcriptMs,
  persona: config.persona,
  context,
  botTalk,
  screenshot: options.screenshot ? roomApi.screenshot : undefined,
  chatDir,
  botName: options.botName,
  log,
});
// Says something to the streamer every --talk-minutes (changed with /自动回复间隔), and on
// /回复, from the room's auto_reply.md.
const talker = new Talker({
  ask,
  outbox,
  promptTemplate: liveText(files.autoReply, () => readFileSync(talkTemplate, 'utf8')),
  intervalMs: options.talkMs,
  room,
  maxLength: options.maxReplyLength,
  log,
});
// Thanks a viewer whose gifts in 5 minutes pass --thanks-threshold (changed with /自动谢礼).
const thanker = new GiftThanker({
  ask,
  outbox,
  promptTemplate: liveText(files.giftThanks, () => readFileSync(giftThanksTemplate, 'utf8')),
  threshold: options.thanksThreshold,
  room,
  userTalk,
  maxLength: options.maxReplyLength,
  log,
});
const bot = new ChatBot({
  events: dyhubEvents(new DyhubClient({ port, roomId, retryMs: 5000 })),
  bot: { nickname: options.botName, userId: options.botId },
  ask,
  outbox,
  room,
  history,
  record,
  billing,
  // Read again when config.json changes, so admins can be added or removed while it runs.
  admins: liveAdmins(resolve(options.configFile), { log }),
  commands: [
    personaCommand(room),
    ...billing.commands(),
    ...talker.commands(),
    ...thanker.commands(),
    songIdCommand(liveText(files.songId, () => readFileSync(songIdTemplate, 'utf8'))),
  ],
  onGift: (gift) => thanker.onGift(gift),
  userTalk,
  maxPending: options.maxPending,
  log,
  promptTemplate: mentionTemplate,
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
  admins: config.admins,
  persona: config.persona,
  talkMinutes: options.talkMs / 60_000,
  thanksThreshold: options.thanksThreshold,
});
bot.start();
void transcriber?.run();
void talker.run();

const shutdown = () => {
  log.info('stopping');
  bot.stop();
  transcriber?.stop();
  talker.stop();
  wallet.clear();
  log.on('finish', () => process.exit(0));
  log.end();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
