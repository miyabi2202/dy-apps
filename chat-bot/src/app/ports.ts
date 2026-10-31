/**
 * What the bot needs from the outside world. `adapters/` implements these with room-feed, the Claude
 * CLI, files and processes; tests pass fakes.
 */
import type { SongGuess } from '@dy-apps/lyrics-search';
import type { ChatRecord } from '../core/chat/chat-record';
import type { Gift, IncomingChat } from '../core/chat/room-events';
import type { ToolListen } from '../core/chat/relevance';
import type { Settings } from '../core/commands/settings';
import type { ToolAccess, ToolContext, ToolSession } from '../core/tools/bot-tool';
import type { ToolDefinition } from '../core/tools/tool-definition';
import type { Exchange } from '../core/chat/talk-record';
import type { OnSingConfig } from '../core/room/room-config';
import type { LifeDay } from '../core/prompts/life';

/** The room's settings, kept in its room_config.json: read each time (so a hand edit counts), and written when something changes one. */
export interface SettingsStore {
  get(): Settings;
  set(patch: Partial<Settings>): void;
}

/** Who the admins are, by user id; it may change while the bot runs. */
export interface Admins {
  has(userId: string): boolean;
}

/** Who the room's streamer is, or null while it isn't known yet. */
export type FindStreamer = () => Promise<{ uid: string; nickname: string } | null>;

/** Everything the bot has said in the room, so Claude can see it and not repeat itself. */
export interface BotTalk {
  add(text: string): void;
  /** The latest of it, one message a line, oldest first; empty when there's none. */
  recent(): string;
}

export type { Exchange, LifeDay, OnSingConfig };

/**
 * What happened to each persona on its own days (see LifeWriter), shared by every room that plays it:
 * a day once written is never changed.
 */
export interface LifeLog {
  /** The latest `days` days written for `persona`, oldest first. */
  recent(persona: string, days: number): LifeDay[];
  has(persona: string, date: string): boolean;
  /** Writes `date` for `persona`; false when that day was already written (by another room's bot, say). */
  add(persona: string, date: string, text: string): boolean;
}

/**
 * The bot's own thoughts after each stream in a room (see RememberChat): what it made of it, in its
 * persona's voice, one a line with the day it's about. Only ever added to.
 */
export interface Thoughts {
  /** The latest `count`, oldest first, one a line (`2026-10-31：…`); empty when there are none. */
  recent(count: number): string;
  /** Adds `entries`, each about the stream on `date` (`2026-10-31`, or a span of days). */
  add(date: string, entries: readonly string[]): void;
}

/** Each viewer's past exchanges with the bot, by user id, so a regular gets continuity. */
export interface UserTalk {
  add(userId: string, exchange: Exchange): void;
  /** Their latest exchanges, oldest first; empty when there are none. */
  recent(userId: string): string;
}

/** The logger methods the bot uses; a winston logger fits. */
export interface Log {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

/** A live room's chat and gifts as they happen. */
export interface RoomEvents {
  onChat(handler: (chat: IncomingChat) => void): void;
  onGift(handler: (gift: Gift) => void): void;
  /** The connection's state, for the log. */
  onStatus(handler: (status: string, detail?: string) => void): void;
  connect(): void;
  close(): void;
}

/** Sends one chat message to the live room as the bot's account. */
export type SendChat = (text: string) => Promise<SendResult>;

interface SendResult {
  /** Whether the message came back in the room's chat stream, i.e. Douyin took it. */
  echoed: boolean;
}

/**
 * Gives about `likes` likes by holding Douyin's like key on the live video: about how many it gave
 * (give or take a few), how long it held, and whether Douyin's 手速太快了 stopped it first.
 */
export type PressLike = (
  likes: number,
) => Promise<{ liked: number; heldMs: number; tooFast: boolean }>;

/** A gift not sent because the account has fewer `diamonds` than its `price`: nothing was clicked. */
export interface NotEnoughDiamonds {
  result: 'notEnough';
  diamonds: number;
  price: number;
}

/**
 * Sends the streamer today's 粉丝团灯牌 (2 diamonds) as the bot's account: `already` when it was
 * sent today, `notEnough` with too few diamonds.
 */
export type SendFansLamp = () => Promise<
  { result: 'sent' } | { result: 'already' } | NotEnoughDiamonds
>;

/**
 * Sends the streamer one 小心心 (1 diamond) as the bot's account: `sent` with the diamonds left
 * (null when unknown), or `notEnough`.
 */
export type SendHeart = () => Promise<
  { result: 'sent'; diamondsLeft: number | null } | NotEnoughDiamonds
>;

/** A JPEG of the live video. */
export type Screenshot = () => Promise<Uint8Array>;

/** The room's stream URL, or null while there isn't one (not live, or room-feed still opening it). */
export type StreamUrl = () => Promise<string | null>;

/** One question for a model (Claude or Codex): the prompt, and optionally a JPEG to look at with it. */
export interface Question {
  prompt: string;
  image?: Uint8Array;
  /** The tools Claude may use for this question, when not all of the usual ones. Codex ignores it. */
  tools?: readonly string[];
  /**
   * Give up after this many turns (each a step of thinking and tool use), to cap the cost. Codex
   * ignores it.
   */
  maxTurns?: number;
  /** A JSON Schema the answer must follow: the answer is then that JSON. */
  schema?: object;
  /** Why it's asked, for the log (`alias`, `judge`…); the models ignore it. */
  why?: string;
  /** The bot's own tools for this question (see BotTools): Claude may call them. Codex ignores it. */
  botTools?: ToolAccess;
  /** Give up after this long, when not the model's usual limit (a question with tools may wait on one). */
  timeoutMs?: number;
}

/** The bot's tools for Claude (an MCP server, adapters/mcp/): a session for one question, or null while the server isn't running. */
export interface BotTools {
  open(context: ToolContext): ToolSession | null;
}

/**
 * Names a song from the lines sung (NetEase's lyrics search, in about a second), and its singer
 * only when one clearly leads; never throws for a service that is down (that is an unsure guess).
 */
export type SearchLyrics = (
  lines: readonly { text: string; sung: boolean }[],
) => Promise<SongGuess>;

/**
 * A song's lyrics from NetEase, by its title and singer: the sung lines of its first versions with
 * lyrics, run together; empty when it has none, or NetEase fails or is down.
 */
export type FetchLyrics = (title: string, artist: string) => Promise<string[]>;

/** Asks a model (Claude or Codex) one question and resolves with its answer. */
export type AskModel = (question: Question) => Promise<string>;

/**
 * Scores, from 0 to 1, how likely the answer to each of `questions` (by key) is yes, given
 * `state`: a fast yes/no classifier (TypeSafe's Jev), far cheaper than asking Claude.
 */
export type Judge = (
  state: string,
  questions: Record<string, string>,
) => Promise<Record<string, number>>;

/** The room's chat record, kept in files in `dir` that Claude may read. */
export interface RoomRecord {
  readonly dir: string;
  add(record: ChatRecord): void;
}

/** A running transcription worker. */
export interface Worker {
  kill(): void;
  /** Writes a line (a request: a stream URL or a music one) to it. */
  send(line: string): void;
  /** Resolves with the exit code when it stops, or rejects when it couldn't start. */
  exited: Promise<number | null>;
}

/**
 * Starts the transcription worker, which loads its models and then waits for a stream URL
 * (asr/transcribe.py's protocol). `onLine` gets each line it prints (one JSON sentence, music
 * answer or status each), `onLog` its diagnostics.
 */
export type SpawnWorker = (handlers: {
  onLine: (line: string) => void;
  onLog: (line: string) => void;
}) => Worker;

/**
 * A declarative tool as the bot has it (see loadToolDefinitions): its definition with the guidance
 * read on each call, the room's files filled in, and `listen.mentions` as a function of the text.
 */
export type DefinedTool = Omit<ToolDefinition, 'guidance' | 'listen'> & {
  guidance?: () => string;
  listen?: ToolListen;
};
