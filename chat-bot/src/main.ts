/**
 * Entry point: reads the options, builds the real objects and starts the bot.
 *
 *     pnpm start --room 259175310675 --bot-name 默认关闭
 */
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
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
import { loadAdditionalCommands } from './adapters/additional-command-files';
import { readDownloads, runDownloads } from './adapters/room-downloads';
import {
  liveRoomConfig,
  liveSection,
  livePrompt,
  liveText,
  type PromptName,
  roomFiles,
  saveStreamer,
} from './adapters/room-files';
import { botTalkFile, userTalkFiles } from './adapters/room-talk-files';
import { jev } from './adapters/jev';
import { jsonFileStorage } from './adapters/wallet-file';
import { createLogger } from './adapters/winston-logger';
import { AutoReply } from './app/auto-reply';
import { AutoSongId } from './app/auto-song-id';
import type { AskClaude } from './app/ports';
import { Billing } from './app/billing';
import { ChatBot } from './app/chat-bot';
import { GiftThanker } from './app/gift-thanker';
import { MaliceWatch } from './app/malice-watch';
import { solveCommand } from './app/solve-command';
import { OnSing } from './app/on-sing';
import { SongIntro } from './app/song-intro';
import { StreamerAdmin } from './app/streamer-admin';
import { MentionAnswerer } from './app/mention-answerer';
import { Outbox } from './app/outbox';
import { RoomFeed } from './app/room-feed';
import { personaCommand, RoomState, screenshotCommand } from './app/room-state';
import { musicCommand } from './app/music-command';
import { SongId } from './app/song-id';
import { Transcriber } from './app/transcriber';
import { parseCliOptions, USAGE } from './cli-options';
import { ChatHistory } from './core/chat-history';
import { RecentGifts } from './core/recent-gifts';
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
// The prompts are shared by every room, a room's own file overrides one (see PROMPT_FILES), and the
// room's context.md; all read on every use so edits apply while it runs.
// Plus what the bot said, overall and to each viewer, so it doesn't repeat itself.
const prompt = (name: PromptName, sharedPath?: string) =>
  livePrompt(name, { packageDir, roomDir, sharedPath });
const files = roomFiles(roomDir);
const context = liveText(files.context);
// What the bot says about itself when asked, shared by every room.
const intro = liveText(join(packageDir, 'intro.md'));
// The room's room_config.json, read again when it changes: whether it's a 私密 room, and what
// the bot says when the streamer starts a song.
const roomConfig = liveRoomConfig(files.config, { log });
// On entering the room, fetches room_config.json's download list into data/<房间号>/artifacts/
// (each through its transformer script, if it has one), in the background: a slow or failed
// download doesn't hold up the bot.
void runDownloads(readDownloads(files.config, { log }), roomDir, { log });
// The room's own commands, listed in data/<房间号>/additional_commands/index.json (主播会唱xxx吗):
// answered when a mention asks for one, or auto-reply finds what someone said is for one.
const additionalCommands = loadAdditionalCommands(roomDir, { log });
const commandsSection = liveSection(join(packageDir, 'commands.md'), 'The commands');
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
// With a screenshot, Claude may zoom into part of it to read small figures and text
// (src/adapters/zoom-mcp.ts, an MCP server cropping with ffmpeg).
const zoom = {
  command: join(packageDir, 'node_modules', '.bin', 'tsx'),
  args: [join(packageDir, 'src', 'adapters', 'zoom-mcp.ts')],
};
// An empty working directory, so Claude Code picks up no project's CLAUDE.md or settings.
const ask = claudeCli({
  cwd: tmpdir(),
  tools: options.tools,
  readDirs: [chatDir],
  model: options.model,
  systemPrompt: options.systemPrompt,
  // Zooming into a screenshot can make an answer take a minute or two.
  timeoutMs: 240_000,
  zoom,
});
// Every message the bot sends waits here, and goes out at least --send-interval seconds apart.
const outbox = new Outbox({
  send: roomApi.sendChat,
  log,
  intervalMs: options.sendIntervalMs,
  onSent: ({ text }) => botTalk.add(text),
});
// The mention prompt is the one with no room override; --prompt may point elsewhere.
const mentionTemplate = livePrompt('mention', {
  packageDir,
  sharedPath: resolve(options.promptFile),
});
const history = new ChatHistory(options.historySize);
// The last few minutes' gifts, among the chat in every prompt (so 「谢一下这个礼物」 knows which).
const gifts = new RecentGifts();
// Three closures point forward: the room's settings (to autoReply, thanker and autoSongId), the
// autoReply's reply and the answerer's onCommandRequest (to the bot). They run only after the bot
// exists, since nothing calls room.promptInput() or starts autoReply while this is wired.
// What the room looks like now, for every prompt. The bot plays config.persona until
// /修改人设 changes it for this run. The prompts also get the settings admins can change, and
// the list of commands from commands.md, so the bot can tell viewers what it can do.
const room = new RoomState({
  history,
  gifts,
  transcript,
  transcriptMs: options.transcriptMs,
  persona: config.persona,
  context,
  intro,
  botTalk,
  // Off unless --screenshot; /截图 switches it while the bot runs.
  screenshot: roomApi.screenshot,
  screenshotsOn: options.screenshot,
  chatDir,
  botName: options.botName,
  settings: (): Omit<RoomSettings, 'screenshots'> => ({
    mentionCost: billing.cost,
    autoReplyThreshold: autoReply.threshold,
    thanksThreshold: thanker.threshold,
    autoSongId: autoSongId?.on ?? false,
  }),
  // commands.md's list, and the room's own commands, which Claude asks for by name.
  commands: () =>
    additionalCommands.length
      ? [
          commandsSection(),
          '',
          '### 这个直播间自己的指令（不用打 /：观众问到这类问题，就在 command_request 写指令名，command_args 留空，程序会用它专门的资料回答）',
          '',
          ...additionalCommands.map(({ id, name, when }) => `- ${id}（${name}）：${when}`),
        ].join('\n')
      : commandsSection(),
  log,
});
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
// Joins in when Jev (with JEV_API_KEY from chat-bot/.env) scores something said in the room as
// about the bot at --auto-reply-threshold or more (/自动回复阈值 changes it), or when someone it just
// answered says something. Both Jev and Codex (which picks whom to answer) are needed; without
// either, it only talks when @ed.
const jevKey = process.env.JEV_API_KEY;
if (!jevKey)
  log.warn('no JEV_API_KEY in chat-bot/.env: auto-reply is off, the bot only talks when @ed');
if (!options.codex) log.warn('--codex is empty: auto-reply is off, the bot only talks when @ed');
// Codex reads its working directory, so it gets an empty one.
const emptyDir = mkdtempSync(join(tmpdir(), 'chat-bot-agent-'));
// /解题 and /拼命解题: Codex's gpt-6-astra, which on figure puzzles was faster and more often
// right than Claude Opus or Fable, even with their zoom tool; /拼命解题 thinks harder.
const solveAsk = (effort: string, timeoutMs: number) =>
  codexCli({
    model: 'gpt-6-astra',
    effort,
    webSearch: false,
    timeoutMs,
    cwd: emptyDir,
    systemPrompt: options.systemPrompt,
    zoom,
  });
// Once Jev finds something about the bot, Codex (the cheap model, no web search) picks whom to
// answer, and each is answered like a mention (charged, with their own talk.txt; the streamer's
// too, by their uid).
// Never asked: without Codex there's no judge either.
const noPicker: AskClaude = () => Promise.reject(new Error('--codex is empty'));
const autoReply = new AutoReply({
  outbox,
  judge: jevKey && options.codex ? jev({ apiKey: jevKey }) : undefined,
  threshold: options.autoReplyThreshold,
  room,
  log,
  picker: options.codex
    ? codexCli({
        model: options.codex,
        // Low sometimes picked nobody when someone clearly wanted an answer; medium is ~4 s slower.
        effort: 'medium',
        webSearch: false,
        cwd: emptyDir,
        systemPrompt: options.systemPrompt,
      })
    : noPicker,
  pickTemplate: prompt('replyPick'),
  reply: (target) => bot.replyUnprompted(target),
  streamer: () => admins.current(),
  additionalCommands,
});
// Thanks a viewer whose gifts in 5 minutes pass --thanks-threshold (changed with /自动谢礼).
const thanker = new GiftThanker({
  ask,
  outbox,
  promptTemplate: prompt('giftThanks'),
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
// A chat matching a room command's trigger has auto-reply look now, not at its next check.
feed.onChat((chat) => autoReply.hear(chat));
feed.onGift((gift) => {
  gifts.add(room.now(), gift);
  thanker.onGift(gift);
});
// @s a viewer whose chat is found malicious, once /识别恶意言论 1 turns it on: Jev scores each chat,
// and Codex decides on the few it lets through, with the chat around them. Off without either.
const maliceWatch =
  jevKey && options.codex
    ? new MaliceWatch({
        judge: jev({ apiKey: jevKey }),
        ask: codexCli({
          model: options.codex,
          effort: 'medium',
          webSearch: false,
          cwd: emptyDir,
          systemPrompt: options.systemPrompt,
        }),
        promptTemplate: prompt('malice'),
        outbox,
        room,
        exempt: (userId) => admins.has(userId),
        log,
      })
    : null;
feed.onChat((chat) => maliceWatch?.hear(chat));
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
  // What they say next goes straight to the picker for a minute: it's likely a reply.
  onAnswered: (userId) => autoReply.answered(userId),
  // 「把你的人设改成小猫」 and the like: run the command if they may.
  onCommandRequest: (mention, name, args) => bot.requestCommand(mention, name, args),
});
// /识歌 and /自动识歌: Codex, which searches with Google; without Codex, neither.
// Once a song is named, may say up to two more things about it, or nothing.
const songIntro = new SongIntro({
  ask,
  outbox,
  promptTemplate: prompt('songIntro'),
  room,
  log,
  maxLength: options.maxReplyLength,
});
const songId = options.codex
  ? new SongId({
      prompt: prompt('songId'),
      codex: codexCli({
        model: options.codex,
        // Low sometimes answered without searching at all; medium always searched, ~8 s slower.
        effort: 'medium',
        cwd: emptyDir,
        systemPrompt: options.systemPrompt,
      }),
      log,
      onTold: (song) => void songIntro.introduce(song),
    })
  : null;
// And the streamer singing has the song named, when /自动识歌 (or --auto-song-id) turns it on.
const autoSongId =
  transcriber && songId
    ? new AutoSongId({
        songId,
        room,
        outbox,
        log,
        on: options.autoSongId,
        maxLength: options.maxReplyLength,
      })
    : null;
// And, in a room with on_sing in its room_config.json, its message as the streamer starts a song.
const onSing = new OnSing({ config: () => roomConfig().onSing, room, outbox, log });
transcriber?.onLine((line) => {
  autoSongId?.hear(line);
  onSing.hear(line);
});
// Decides what a mention is (a question, or a command) and charges for it.
const bot: ChatBot = new ChatBot({
  feed,
  answerer,
  room,
  outbox,
  log,
  billing,
  admins,
  adminNames: config.adminNames,
  additionalCommands,
  commands: [
    personaCommand(room),
    ...billing.commands(),
    ...autoReply.commands(),
    ...thanker.commands(),
    screenshotCommand(room),
    ...(songId?.commands() ?? []),
    solveCommand({ name: '解题', prompt: prompt('solve'), ask: solveAsk('medium', 360_000) }),
    solveCommand({ name: '拼命解题', prompt: prompt('solve'), ask: solveAsk('high', 600_000) }),
    ...(autoSongId?.commands() ?? []),
    ...(maliceWatch?.commands() ?? []),
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
  autoReplyThreshold: options.autoReplyThreshold,
  thanksThreshold: options.thanksThreshold,
  autoSongId: options.autoSongId,
});
bot.start();
void transcriber?.run();
void autoReply.run();

const shutdown = () => {
  log.info('stopping');
  bot.stop();
  transcriber?.stop();
  autoReply.stop();
  wallet.clear();
  log.on('finish', () => process.exit(0));
  log.end();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
