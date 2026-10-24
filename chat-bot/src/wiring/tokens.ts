/**
 * Every token of the bot's container, by the area that registers it (see the `register…` in each
 * module here). A test swaps the adapters' for fakes.
 */
import type { LyricsSearch } from '@dy-apps/lyrics-search';
import type { CodexCliOptions } from '../adapters/models/codex-cli';
import type { RoomFeedApi } from '../adapters/room-feed/room-feed-api';
import type { RoomConfig, RoomFiles, roomConfigFile } from '../adapters/files/room-files';
import type { BotConfig } from '../adapters/files/config-file';
import type { AutoReply } from '../app/replies/auto-reply';
import type { AutoSongId } from '../app/songs/auto-song-id';
import type { ChatBot } from '../app/replies/chat-bot';
import type { EventBus } from '../app/event-bus';
import type { GiftThanker } from '../app/replies/gift-thanker';
import type { MaliceWatch } from '../app/replies/malice-watch';
import type { BotTool } from '../mcp/rpc';
import type { BotMcpServer } from '../mcp/server';
import type { MentionAnswerer } from '../app/replies/mention-answerer';
import type { OnSing } from '../app/songs/on-sing';
import type { SongEnds } from '../app/songs/song-ends';
import type { BackingGapBreaks } from '../app/songs/backing-gap-breaks';
import type { LyricsBreaks } from '../app/songs/lyrics-breaks';
import type { ShazamBreaks } from '../app/songs/shazam-breaks';
import type { Outbox } from '../app/replies/outbox';
import type {
  AskModel,
  BotTalk,
  DefinedTool,
  Judge,
  Log,
  RoomEvents,
  FetchLyrics,
  SearchLyrics,
  RoomRecord,
  SettingsStore,
  SpawnWorker,
  UserTalk,
} from '../app/ports';
import type { RoomFeed } from '../app/room/room-feed';
import type { RoomState } from '../app/room/room-state';
import type { SongId } from '../app/songs/song-id';
import type { SongIntro } from '../app/songs/song-intro';
import type { StreamerAdmin } from '../app/commands/streamer-admin';
import type { Transcriber } from '../app/songs/transcriber';
import type { CliOptions } from '../cli-options';
import type { SolveEffort } from '../core/commands/settings';
import type { ChatHistory } from '../core/chat/chat-history';
import type { RecentGifts } from '../core/chat/recent-gifts';
import type { Transcript } from '../core/songs/transcript';
import type { PromptName } from '../adapters/files/room-files';
import type { App } from './app';
import { token } from './container';

// Given to buildContainer: what the entry knows.
export const OPTIONS = token<CliOptions>('options');
export const PACKAGE_DIR = token<string>('packageDir');
/** chat-bot/prompts/: every text the models are sent (the prompts, wording.md, the shared personas). */
export const PROMPTS_DIR = token<string>('promptsDir');
/** The words the bot must never say (prompts/forbidden-words.md), read on every call. */
export const FORBIDDEN_WORDS = token<() => readonly string[]>('forbiddenWords');
export const LOG = token<Log>('log');
/** The environment variables the bot reads (`JEV_API_KEY` from chat-bot/.env). */
export const ENV = token<{ JEV_API_KEY?: string }>('env');

// adapters.ts: the outside world, which a test replaces.
export const ROOM_API =
  token<Pick<RoomFeedApi, 'sendChat' | 'streamUrl' | 'streamer' | 'screenshot'>>('roomApi');
export const ROOM_EVENTS = token<RoomEvents>('roomEvents');
export const SPAWN_WORKER = token<SpawnWorker>('spawnWorker');
/** `claude -p` for this room. */
export const CLAUDE_CLI = token<AskModel>('claudeCli');
/** `codex exec` with the room's usual settings, which `over` changes. */
export const CODEX_CLI = token<(over: CodexCliOptions) => AskModel>('codexCli');
/** Jev, for an API key. */
export const JEV_CLIENT = token<(apiKey: string) => Judge>('jevClient');
/** NetEase's searches and lyrics; null with --no-lyrics-search. */
export const NETEASE = token<LyricsSearch | null>('netease');
/** Names a song from lyrics; null with --no-lyrics-search. */
export const LYRICS_SEARCH = token<SearchLyrics | null>('lyricsSearch');
/** A song's lyrics from NetEase, by title and singer; null with --no-lyrics-search. */
export const FETCH_LYRICS = token<FetchLyrics | null>('fetchLyrics');
/** Fetches the files the room's room_config.json lists, in the background. */
export const DOWNLOADS = token<() => void>('downloads');

// models.ts: the adapters, each use logged with its task.
export const ASK_CLAUDE = token<(task: string) => AskModel>('askClaude');
export const ASK_CODEX = token<(task: string, over: CodexCliOptions) => AskModel>('askCodex');
/** Codex for `ask_about_puzzle`, at the effort the room is set to. */
export const ASK_SOLVE = token<(effort: SolveEffort) => AskModel>('askSolve');
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
export const RECORD = token<RoomRecord>('record');
export const SINGING = token<Pick<RoomRecord, 'add'>>('singing');
export const BOT_TALK = token<BotTalk>('botTalk');
export const USER_TALK = token<UserTalk>('userTalk');
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
export const SONG_ENDS = token<SongEnds>('songEnds');
/** The lyrics song break source (see song-breaks.ts); null without NetEase. */
export const LYRICS_BREAKS = token<LyricsBreaks | null>('lyricsBreaks');
/** The song break source from Shazam's backing titles, ranked below the lyrics. */
export const SHAZAM_BREAKS = token<ShazamBreaks>('shazamBreaks');
/** The song break source from the backing track stopping, ranked below Shazam's titles. */
export const BACKING_GAP_BREAKS = token<BackingGapBreaks>('backingGapBreaks');

// malice.ts: null without Jev.
export const MALICE_WATCH = token<MaliceWatch | null>('maliceWatch');

// transcriber.ts: null with --no-asr.
export const TRANSCRIBER = token<Transcriber | null>('transcriber');

// mcp.ts: the bot's tools, and the server that gives them to Claude.
/** The bot's tools as they are now, for Claude's sessions and for typed `/` commands alike. */
export const TOOLS = token<() => BotTool[]>('tools');
/** The declarative tools defined in src/mcp/tools/, as they are now; a room switches them on in its room_config.json. */
export const TOOL_DEFINITIONS = token<() => DefinedTool[]>('toolDefinitions');
export const MCP_SERVER = token<BotMcpServer>('mcpServer');

// bot.ts: the mentions' answerer and the bot.
export const ANSWERER = token<MentionAnswerer>('answerer');
export const BOT = token<ChatBot>('bot');

// app.ts: everything, started and stopped.
export const APP = token<App>('app');
