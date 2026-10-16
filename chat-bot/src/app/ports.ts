/**
 * What the bot needs from the outside world. `adapters/` implements these with DyHub, the Claude
 * CLI, files and processes; tests pass fakes.
 */
import type { ChatRecord } from '../core/chat-record';
import type { Gift, IncomingChat } from '../core/room-events';

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
}

/** Asks Claude one question and resolves with its answer. */
export type AskClaude = (question: Question) => Promise<string>;

/** The room's chat record, kept in files in `dir` that Claude may read. */
export interface RoomRecord {
  readonly dir: string;
  add(record: ChatRecord): void;
}

/** A running transcription worker. */
export interface Worker {
  kill(): void;
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
