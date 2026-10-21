/**
 * Every token of the bot's container, by the area that registers it (see the `register…` in each
 * module here). A test swaps the adapters' for fakes.
 */
import type { CodexCliOptions } from '../adapters/codex-cli';
import type { RoomFeedApi } from '../adapters/room-feed-api';
import type { RoomConfig, RoomFiles, roomConfigFile } from '../adapters/room-files';
import type { BotConfig } from '../adapters/config-file';
import type { AutoReply } from '../app/auto-reply';
import type { AutoSongId } from '../app/auto-song-id';
import type { Billing } from '../app/billing';
import type { ChatBot } from '../app/chat-bot';
import type { Command } from '../app/command';
import type { EventBus } from '../app/event-bus';
import type { GiftThanker } from '../app/gift-thanker';
import type { MaliceWatch } from '../app/malice-watch';
import type { MentionAnswerer } from '../app/mention-answerer';
import type { OnSing } from '../app/on-sing';
import type { Outbox } from '../app/outbox';
import type {
  AdditionalCommand,
  AskModel,
  BotTalk,
  Judge,
  Log,
  RoomEvents,
  RoomRecord,
  SettingsStore,
  SpawnWorker,
  UserTalk,
} from '../app/ports';
import type { RoomFeed } from '../app/room-feed';
import type { RoomState } from '../app/room-state';
import type { SongId } from '../app/song-id';
import type { SongIntro } from '../app/song-intro';
import type { StreamerAdmin } from '../app/streamer-admin';
import type { Transcriber } from '../app/transcriber';
import type { CliOptions } from '../cli-options';
import type { ChatHistory } from '../core/chat-history';
import type { RecentGifts } from '../core/recent-gifts';
import type { Transcript } from '../core/transcript';
import type { Wallet, WalletStorage } from '../core/wallet';
import type { PromptName } from '../adapters/room-files';
import type { App } from './app';
import { token } from './container';

// Given to buildContainer: what the entry knows.
export const OPTIONS = token<CliOptions>('options');
export const PACKAGE_DIR = token<string>('packageDir');
/** chat-bot/prompts/: every text the models are sent (the prompts, wording.md, the shared personas). */
export const PROMPTS_DIR = token<string>('promptsDir');
export const LOG = token<Log>('log');
/** The environment variables the bot reads (`JEV_API_KEY` from chat-bot/.env). */
export const ENV = token<{ JEV_API_KEY?: string }>('env');

// adapters.ts: the outside world, which a test replaces.
export const ROOM_API =
  token<Pick<RoomFeedApi, 'sendChat' | 'streamUrl' | 'streamer' | 'screenshot'>>('roomApi');
export const ROOM_EVENTS = token<RoomEvents>('roomEvents');
export const SPAWN_WORKER = token<SpawnWorker>('spawnWorker');
export const WALLET_STORAGE = token<WalletStorage>('walletStorage');
/** `claude -p` for this room. */
export const CLAUDE_CLI = token<AskModel>('claudeCli');
/** `codex exec` with the room's usual settings, which `over` changes. */
export const CODEX_CLI = token<(over: CodexCliOptions) => AskModel>('codexCli');
/** Jev, for an API key. */
export const JEV_CLIENT = token<(apiKey: string) => Judge>('jevClient');
/** Fetches the files the room's room_config.json lists, in the background. */
export const DOWNLOADS = token<() => void>('downloads');

// models.ts: the adapters, each use logged with its task.
export const ASK_CLAUDE = token<(task: string) => AskModel>('askClaude');
export const ASK_CODEX = token<(task: string, over: CodexCliOptions) => AskModel>('askCodex');
export const ASK_SOLVE =
  token<(task: string, effort: string, timeoutMs: number) => AskModel>('askSolve');
/** Jev for `task`; undefined without a JEV_API_KEY or Codex, and with it every feature that needs it. */
export const JUDGE = token<(task: string) => Judge | undefined>('judge');

// room.ts: the room, its files and its way of talking.
export const ROOM_DIR = token<string>('roomDir');
export const CHAT_DIR = token<string>('chatDir');
export const ROOM_FILES = token<RoomFiles>('roomFiles');
/** The room's room_config.json, read hot and written by `update`. */
export const ROOM_CONFIG_FILE = token<ReturnType<typeof roomConfigFile>>('roomConfigFile');
export const ROOM_CONFIG = token<() => RoomConfig>('roomConfig');
/** The settings admins can change, kept in room_config.json. */
export const SETTINGS = token<SettingsStore>('settings');
export const BOT_CONFIG = token<BotConfig>('botConfig');
export const ADMINS = token<StreamerAdmin>('admins');
export const BUS = token<EventBus>('bus');
export const HISTORY = token<ChatHistory>('history');
export const GIFTS = token<RecentGifts>('gifts');
export const TRANSCRIPT = token<Transcript>('transcript');
export const WALLET = token<Wallet>('wallet');
export const BILLING = token<Billing>('billing');
export const RECORD = token<RoomRecord>('record');
export const BOT_TALK = token<BotTalk>('botTalk');
export const USER_TALK = token<UserTalk>('userTalk');
export const ADDITIONAL_COMMANDS = token<AdditionalCommand[]>('additionalCommands');
/** The prompt `name`, read on every use: the room's own file, else the shared one. */
export const PROMPT = token<(name: PromptName) => () => string>('prompt');
export const ROOM = token<RoomState>('room');
export const OUTBOX = token<Outbox>('outbox');
export const FEED = token<RoomFeed>('feed');

// auto-reply.ts: what the bot says unprompted.
export const AUTO_REPLY = token<AutoReply>('autoReply');
export const THANKER = token<GiftThanker>('thanker');

// songs.ts: naming the songs sung; null without what they need.
export const SONG_INTRO = token<SongIntro>('songIntro');
export const SONG_ID = token<SongId | null>('songId');
export const AUTO_SONG_ID = token<AutoSongId | null>('autoSongId');
export const ON_SING = token<OnSing>('onSing');

// malice.ts: null without Jev.
export const MALICE_WATCH = token<MaliceWatch | null>('maliceWatch');

// transcriber.ts: null with --no-asr.
export const TRANSCRIBER = token<Transcriber | null>('transcriber');

// bot.ts: the mentions' answerer, the commands and the bot.
export const ANSWERER = token<MentionAnswerer>('answerer');
export const COMMANDS = token<Command[]>('commands');
export const BOT = token<ChatBot>('bot');

// app.ts: everything, started and stopped.
export const APP = token<App>('app');
