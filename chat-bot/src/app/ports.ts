/**
 * What the bot needs from the outside world. `adapters/` implements these with DyHub, the Claude
 * CLI, files and processes; tests pass fakes.
 */
import type { ChatRecord } from '../core/chat-record';
import type { Gift, IncomingChat } from '../core/room-events';
import type { LyricHit } from '../core/lyrics';
import type { Exchange } from '../core/talk-record';

/** Who the admins are, by user id; it may change while the bot runs. */
export interface Admins {
  has(userId: string): boolean;
}

/** What the streamer says in this room to wake the bot; it may change while the bot runs. */
export interface WakeWords {
  /** The room's wake word, or the default one; empty for none. */
  get(): string;
  /** Sets the room's own wake word. */
  set(phrase: string): void;
}

/** Everything the bot has said in the room, so Claude can see it and not repeat itself. */
export interface BotTalk {
  add(text: string): void;
  /** The latest of it, one message a line, oldest first; empty when there's none. */
  recent(): string;
}

export type { Exchange };

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

export interface SendResult {
  /** Whether the message came back in the room's chat stream, i.e. Douyin took it. */
  echoed: boolean;
}

/** A JPEG of the live video. */
export type Screenshot = () => Promise<Uint8Array>;

/** The room's stream URL, or null while there isn't one (not live, or DyHub still opening it). */
export type StreamUrl = () => Promise<string | null>;

/** One question for Claude: the prompt, and optionally a JPEG to look at with it. */
export interface Question {
  prompt: string;
  image?: Uint8Array;
  /** The tools Claude may use for this question, when not all of the usual ones. */
  tools?: readonly string[];
  /** Give up after this many turns (each a step of thinking and tool use), to cap the cost. */
  maxTurns?: number;
  /** A JSON Schema the answer must follow: the answer is then that JSON. */
  schema?: object;
}

/** Asks Claude one question and resolves with its answer. */
export type AskClaude = (question: Question) => Promise<string>;

/** Songs on a lyrics site whose lyrics contain `fragment`. */
export type LyricsSearch = (fragment: string) => Promise<LyricHit[]>;

/** The room's chat record, kept in files in `dir` that Claude may read. */
export interface RoomRecord {
  readonly dir: string;
  add(record: ChatRecord): void;
}

/** A running transcription worker. */
export interface Worker {
  kill(): void;
  /** Writes a line (a request, like a music one) to it. */
  send(line: string): void;
  /** Resolves with the exit code when it stops, or rejects when it couldn't start. */
  exited: Promise<number | null>;
}

/**
 * Starts the transcription worker on a stream URL. `onLine` gets each line it prints (one JSON
 * sentence each), `onLog` its diagnostics.
 */
export type SpawnWorker = (
  url: string,
  handlers: { onLine: (line: string) => void; onLog: (line: string) => void },
) => Worker;
