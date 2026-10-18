/**
 * Entry point: reads the options, builds the real objects and starts the bot.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DyhubClient } from '@dy-apps/services';
import { uvWorker } from './adapters/asr-worker';
import { ChatLog } from './adapters/chat-log-files';
import { claudeCli } from './adapters/claude-cli';
import { codexCli } from './adapters/codex-cli';
import { liveAdmins, readConfig } from './adapters/config-file';
import { dyhubEvents } from './adapters/dyhub-events';
import { DyhubRoomApi } from './adapters/dyhub-room-api';
import {
  liveRoomConfig,
  liveSection,
  liveText,
  roomFiles,
  saveStreamer,
} from './adapters/room-files';
import { botTalkFile, userTalkFiles } from './adapters/room-talk-files';
import { jev } from './adapters/jev';
import { wakeWordFile } from './adapters/wake-word-file';
import { jsonFileStorage } from './adapters/wallet-file';
import { createLogger } from './adapters/winston-logger';
import { AutoSongId } from './app/auto-song-id';
import { Billing } from './app/billing';
import { ChatBot } from './app/chat-bot';
import { GiftThanker } from './app/gift-thanker';
import { SongIntro } from './app/song-intro';
import { StreamerAdmin } from './app/streamer-admin';
import { MentionAnswerer } from './app/mention-answerer';
import { Outbox } from './app/outbox';
import { RoomFeed } from './app/room-feed';
import { personaCommand, RoomState, screenshotCommand } from './app/room-state';
import { musicCommand } from './app/music-command';
import { SongId } from './app/song-id-command';
import { Talker, WOKEN } from './app/talker';
import { Transcriber } from './app/transcriber';
import { WakeWord } from './app/wake-word';
import { parseCliOptions, USAGE } from './cli-options';
import { ChatHistory } from './core/chat-history';
import type { RoomSettings } from './core/prompt';
import { Transcript } from './core/transcript';
import { Wallet } from './core/wallet';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// API keys (JEV_API_KEY) from chat-bot/.env, which git ignores, when there is one.
if (existsSync(join(packageDir, '.env'))) process.loadEnvFile(join(packageDir, '.env'));

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
// The prompts are shared by every room (a room's own auto_reply.md, song_id.md, gift_thanks.md and
// so on overrides one), and the room's context.md; all read on every use so edits apply while it
// runs.
// Plus what the bot said, overall and to each viewer, so it doesn't repeat itself.
const autoReplyTemplate = resolve(options.autoReplyPromptFile);
const songIdTemplate = join(packageDir, 'song-id.md');
const songIdWebTemplate = join(packageDir, 'song-id-web.md');
const giftThanksTemplate = join(packageDir, 'gift-thanks.md');
const songIntroTemplate = join(packageDir, 'song-intro.md');
const replyPickTemplate = join(packageDir, 'reply-pick.md');
const files = roomFiles(roomDir);
const context = liveText(files.context);
// The room's room_config.json, read again when it changes: whether it's a 私密 room.
const roomConfig = liveRoomConfig(files.config, { log });
const botTalk = botTalkFile(files.botTalk);
const userTalk = userTalkFiles(files.users);
// The streamer saying the room's wake word (from --wake-words, read again when it changes) makes
// the bot talk now, for free; /设置唤醒词 changes it.
let wakeWord: WakeWord | null = null;
// And the streamer singing has the song named, when /自动识歌 (or --auto-song-id) turns it on.
let autoSongId: AutoSongId | null = null;
const transcriber = options.asr
  ? new Transcriber({
      streamUrl: roomApi.streamUrl,
      transcript,
      record,
      log,
      onLine: (line) => {
        wakeWord?.hear(line);
        autoSongId?.hear(line);
      },
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
// Each room's wake word, read again when the file changes; /设置唤醒词 writes this room's.
const wakeWords = wakeWordFile(resolve(options.wakeWordsFile), roomId, { log });
// What the room looks like now, for every prompt. The bot plays config.persona until
// /修改人设 changes it for this run. The prompts also get the settings admins can change, and
// the list of commands from commands.md, so the bot can tell viewers what it can do.
const room = new RoomState({
  history,
  transcript,
  transcriptMs: options.transcriptMs,
  persona: config.persona,
  context,
  botTalk,
  // Off unless --screenshot; /截图 switches it while the bot runs.
  screenshot: roomApi.screenshot,
  screenshotsOn: options.screenshot,
  chatDir,
  botName: options.botName,
  settings: (): Omit<RoomSettings, 'screenshots'> => ({
    mentionCost: billing.cost,
    talkThreshold: talker.threshold,
    thanksThreshold: thanker.threshold,
    wakeWord: wakeWords.get(),
    autoSongId: autoSongId?.on ?? false,
  }),
  commands: liveSection(join(packageDir, 'commands.md'), 'The commands'),
  log,
});
// Joins in, from the room's auto_reply.md, when Jev (with JEV_API_KEY from chat-bot/.env) scores
// something said in the room as about the bot at --auto-reply-threshold or more (/自动回复阈值 changes
// it); and talks when the streamer says the wake word.
const jevKey = process.env.JEV_API_KEY;
if (!jevKey)
  log.warn('no JEV_API_KEY in chat-bot/.env: the bot only talks unprompted on the wake word');
// Codex reads its working directory, so it gets an empty one.
const emptyDir = mkdtempSync(join(tmpdir(), 'chat-bot-agent-'));
// Once Jev finds something about the bot, Codex (the cheap model, no web search) picks whom to
// answer, and each is answered like a mention (charged, with their own talk.txt; the streamer's
// too, by their uid). Without Codex, Claude says one message from auto-reply.md instead.
const talker = new Talker({
  ask,
  outbox,
  promptTemplate: liveText(files.autoReply, () => readFileSync(autoReplyTemplate, 'utf8')),
  judge: jevKey ? jev({ apiKey: jevKey }) : undefined,
  threshold: options.talkThreshold,
  room,
  maxLength: options.maxReplyLength,
  log,
  picker: options.codex
    ? codexCli({
        model: options.codex,
        effort: 'low',
        webSearch: false,
        cwd: emptyDir,
        systemPrompt: options.systemPrompt,
      })
    : undefined,
  pickTemplate: liveText(files.replyPick, () => readFileSync(replyPickTemplate, 'utf8')),
  // The bot and the admins are made further down, before the talker runs.
  reply: (target) => bot.replyUnprompted(target),
  streamer: () => admins.current(),
});
wakeWord = new WakeWord({
  words: wakeWords,
  wake: () => talker.talkNow('reply', WOKEN),
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
// Listens to the room: records chat and gifts, credits gifts, and tells the bot of mentions
// and the thanker of gifts.
const feed = new RoomFeed({
  events: dyhubEvents(new DyhubClient({ port, roomId, retryMs: 5000 }), () => roomConfig().private),
  bot: { nickname: options.botName, userId: options.botId },
  history,
  log,
  record,
  billing,
});
feed.onGift((gift) => thanker.onGift(gift));
// Answers each paid question with Claude, one at a time.
const answerer = new MentionAnswerer({
  ask,
  outbox,
  room,
  log,
  promptTemplate: mentionTemplate,
  billing,
  userTalk,
  maxPending: options.maxPending,
  maxReplyLength: options.maxReplyLength,
  maxReplyParts: options.maxReplyParts,
});
// /识歌: Codex, which searches with Google (or Claude, with /识歌模型).
// Once a song is named, says something about it and praises the streamer's singing.
const songIntro = new SongIntro({
  ask,
  outbox,
  promptTemplate: liveText(files.songIntro, () => readFileSync(songIntroTemplate, 'utf8')),
  room,
  log,
  maxLength: options.maxReplyLength,
});
const songId = new SongId({
  prompt: liveText(files.songId, () => readFileSync(songIdTemplate, 'utf8')),
  webPrompt: liveText(files.songIdWeb, () => readFileSync(songIdWebTemplate, 'utf8')),
  claude: ask,
  codex: options.codex
    ? codexCli({
        model: options.codex,
        // Low sometimes answered without searching at all; medium always searched, ~8 s slower.
        effort: 'medium',
        cwd: emptyDir,
        systemPrompt: options.systemPrompt,
      })
    : undefined,
  log,
  onTold: (song) => void songIntro.introduce(song),
});
autoSongId = transcriber
  ? new AutoSongId({
      songId,
      room,
      outbox,
      log,
      on: options.autoSongId,
      maxLength: options.maxReplyLength,
    })
  : null;
// The admins from config.json (read again when it changes, so admins can be added or removed while
// it runs), and the room's streamer once DyHub has read the room page (saved in room_config.json).
const admins = new StreamerAdmin({
  admins: liveAdmins(resolve(options.configFile), { log }),
  find: roomApi.streamer,
  // Noted in the room's room_config.json.
  onFound: (streamer) => saveStreamer(files.config, streamer, { log }),
  log,
});
admins.start();
// Decides what a mention is (a question, or a command) and charges for it.
const bot = new ChatBot({
  feed,
  answerer,
  room,
  outbox,
  log,
  billing,
  admins,
  commands: [
    personaCommand(room),
    ...billing.commands(),
    ...talker.commands(),
    ...thanker.commands(),
    ...wakeWord.commands(),
    screenshotCommand(room),
    ...songId.commands(),
    ...(autoSongId?.commands() ?? []),
    // Only when listening to the stream.
    ...(transcriber ? [musicCommand(() => transcriber.identifyMusic(), log)] : []),
  ],
  maxReplyLength: options.maxReplyLength,
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
  talkThreshold: options.talkThreshold,
  thanksThreshold: options.thanksThreshold,
  autoSongId: options.autoSongId,
  songIdEngine: songId.engine,
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
