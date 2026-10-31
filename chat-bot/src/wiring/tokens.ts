/**
 * Every token of the bot's container, by the area that registers it (see the `register…` in each
 * module here). A test swaps the adapters' for fakes.
 */
import type { LyricsSearch } from '@dy-apps/lyrics-search';
import type { RoomMemory } from '@dy-apps/room-memory';
import type { CodexCliOptions } from '../adapters/models/codex-cli';
import type { RoomFeedApi } from '../adapters/room-feed/room-feed-api';
import type { RoomFiles, roomConfigFile } from '../adapters/files/room-files';
import type { RoomConfig } from '../core/room/room-config';
import type { ForbiddenWords } from '../core/prompts/forbidden';
import type { BotConfig } from '../adapters/files/config-file';
import type { AutoReply } from '../app/replies/auto-reply';
import type { AutoSongId } from '../app/songs/auto-song-id';
import type { ChatBot } from '../app/replies/chat-bot';
import type { ToolRunner } from '../app/tools/tool-runner';
import type { EventBus } from '../app/event-bus';
import type { Feature } from '../app/feature';
import type { BackingGapBreaks } from '../app/songs/backing-gap-breaks';
import type { GiftThanker } from '../app/replies/gift-thanker';
import type { MaliceWatch } from '../app/replies/malice-watch';
import type { BotMcpServer } from '../adapters/mcp/server';
import type { MentionAnswerer } from '../app/replies/mention-answerer';
import type { AutoMessage } from '../app/replies/auto-message';
import type { LifeWriter } from '../app/life/life-writer';
import type { MemoryRecall } from '../app/memory/memory-recall';
import type { KnowledgeRecall } from '../app/knowledge/knowledge-recall';
import type { OnSing } from '../app/songs/on-sing';
import type { SongEnds } from '../app/songs/song-ends';
import type { SongBreakSource } from '../core/songs/song-breaks';
import type { LyricsBreaks } from '../app/songs/lyrics-breaks';
import type { Outbox } from '../app/replies/outbox';
import type {
  AskModel,
  BotTalk,
  DefinedTool,
  Embedder,
  Judge,
  LifeLog,
  Log,
  RoomEvents,
  FetchLyrics,
  SearchLyrics,
  RoomRecord,
  SettingsStore,
  SpawnWorker,
  Thoughts,
  UserTalk,
  VectorCache,
} from '../app/ports';
import type { BotTool } from '../core/tools/bot-tool';
import type { RememberChat } from '../app/memory/remember-chat';
import type { RoomFeed } from '../app/room/room-feed';
import type { BotNames } from '../app/room/bot-names';
import type { RoomState } from '../app/room/room-state';
import type { Screenshots } from '../app/room/screenshots';
import type { SongSpans } from '../app/songs/song-spans';
import type { SongId } from '../app/songs/song-id';
import type { Streamer, StreamerAdmin } from '../app/commands/streamer-admin';
import type { Transcriber } from '../app/songs/transcriber';
import type { CliOptions } from '../cli-options';
import type { SolveEffort } from '../core/commands/settings';
import type { ChatHistory } from '../core/chat/chat-history';
import type { RecentGifts } from '../core/chat/recent-gifts';
import type { Transcript } from '../core/songs/transcript';
import type { PromptName } from '../adapters/files/prompt-files';
import type { App } from './app';
import { token } from './container';

// Given to buildContainer: what the entry knows.
export const OPTIONS = token<CliOptions>('options');
export const PACKAGE_DIR = token<string>('packageDir');
/** chat-bot/prompts/: every text the models are sent (the prompts, wording.md, the shared personas). */
export const PROMPTS_DIR = token<string>('promptsDir');
/**
 * The words Douyin holds back a message for, with what to write instead
 * (prompts/forbidden-words.json), read on every call.
 */
export const FORBIDDEN_WORDS = token<() => ForbiddenWords>('forbiddenWords');
/** The rules for topics the bot must not take up (prompts/forbidden.md's `## Topics`), read on every call. */
export const FORBIDDEN_TOPICS = token<() => string>('forbiddenTopics');
export const LOG = token<Log>('log');
/** The environment variables the bot reads (`JEV_API_KEY` from chat-bot/.env). */
export const ENV = token<{ JEV_API_KEY?: string }>('env');

// adapters.ts: the outside world, which a test replaces.
export const ROOM_API =
  token<
    Pick<
      RoomFeedApi,
      'sendChat' | 'like' | 'sendFansLamp' | 'sendHeart' | 'streamUrl' | 'streamer' | 'screenshot'
    >
  >('roomApi');
export const ROOM_EVENTS = token<RoomEvents>('roomEvents');
export const SPAWN_WORKER = token<SpawnWorker>('spawnWorker');
/** The local embedding service (embedding/serve.py); null with --embedding-port 0. */
export const EMBEDDER = token<Embedder | null>('embedder');
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
/** What the bot remembers in the room: memory.md and each person's note.md, and who may change them. */
export const MEMORY = token<RoomMemory>('memory');
/** The bot's own thoughts after the room's streams, in memory/thoughts.md. */
export const THOUGHTS = token<Thoughts>('thoughts');
/** The vectors made for stored memories, in data/embeddings/, shared by every room's bot. */
export const VECTORS = token<VectorCache>('vectors');
/** Which of its own memories every prompt shows: the latest, and older ones that fit what's said. */
export const RECALL = token<MemoryRecall>('recall');
/** The knowledge base for every prompt (data/knowledge/douyin/): all of it while it's small, else the entries that fit what's said. */
export const KNOWLEDGE = token<KnowledgeRecall>('knowledge');
/** Reads the chat record since last time into memory (`pnpm remember`). */
export const REMEMBER_CHAT = token<RememberChat>('rememberChat');
/** The prompt `name`, read on every use: the room's own file, else the shared one. */
export const PROMPT = token<(name: PromptName) => () => string>('prompt');
/** What the bot is called here, the room's way of writing names, and its time zone. */
export const BOT_NAMES = token<BotNames>('botNames');
/** Who the streamer is: room-feed's word on it, else what room_config.json kept from last time. */
export const STREAMER = token<Streamer>('streamer');
/** The live video for a prompt, while the `screenshots` setting is on. */
export const SCREENSHOTS = token<Screenshots>('screenshots');
export const ROOM = token<RoomState>('room');
export const OUTBOX = token<Outbox>('outbox');
export const FEED = token<RoomFeed>('feed');

// auto-reply.ts: what the bot says unprompted.
export const AUTO_REPLY = token<AutoReply>('autoReply');
export const THANKER = token<GiftThanker>('thanker');
export const AUTO_MESSAGE = token<AutoMessage>('autoMessage');

// life.ts: the personas' own days.
/** What happened to each shared persona on her own days, in data/lives/. */
export const LIFE = token<LifeLog>('life');
export const LIFE_WRITER = token<LifeWriter>('lifeWriter');

// songs.ts: naming the songs sung; null without what they need.
export const SONG_ID = token<SongId | null>('songId');
export const AUTO_SONG_ID = token<AutoSongId | null>('autoSongId');
export const ON_SING = token<OnSing>('onSing');
export const SONG_ENDS = token<SongEnds>('songEnds');
/** The backing track stopping between songs (one of SONG_BREAK_SOURCES), fed the worker's backing levels. */
export const BACKING_GAP_BREAKS = token<BackingGapBreaks>('backingGapBreaks');
/** The lyrics song break source (see song-breaks.ts); null without NetEase. */
export const LYRICS_BREAKS = token<LyricsBreaks | null>('lyricsBreaks');
/**
 * Every song break source the room asks, highest ranked first: the lyrics (when there are any),
 * then Shazam's backing titles, then the backing track stopping.
 */
/** Where the songs in what the streamer said begin and end, by the sources the room has on. */
export const SONG_SPANS = token<SongSpans>('songSpans');
export const SONG_BREAK_SOURCES = token<readonly SongBreakSource[]>('songBreakSources');

// malice.ts: null without Jev.
export const MALICE_WATCH = token<MaliceWatch | null>('maliceWatch');

// transcriber.ts: null with --no-asr.
export const TRANSCRIBER = token<Transcriber | null>('transcriber');

// mcp.ts: the bot's tools, and the server that gives them to Claude.
/** The bot's tools as they are now, for Claude's sessions and for typed `/` commands alike. */
export const TOOLS = token<() => BotTool[]>('tools');
/** The declarative tools defined in chat-bot/tools/, as they are now; a room switches them on in its room_config.json. */
export const TOOL_DEFINITIONS = token<() => DefinedTool[]>('toolDefinitions');
export const MCP_SERVER = token<BotMcpServer>('mcpServer');

// bot.ts: the mentions' answerer and the bot.
export const ANSWERER = token<MentionAnswerer>('answerer');
export const TOOL_RUNNER = token<ToolRunner>('toolRunner');
export const BOT = token<ChatBot>('bot');

// features.ts: what listens to the room, from start() to stop().
export const FEATURES = token<readonly Feature[]>('features');

// app.ts: everything, started and stopped.
export const APP = token<App>('app');
