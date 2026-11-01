import type { AnswerKind } from '../douyin/page-map';

/**
 * The outside world, as the use cases see it. The real ones are in adapters/ (files, processes,
 * Claude, Playwright); tests give fakes.
 */

/** A line for the person running it. */
export type Log = (message: string) => void;

/**
 * A folder of files, named relative to it: `dy-browse/data/` (state, the lock, the feed log) or
 * the chat bot's `data/` (what the bot reads: `<房间号>/memory/posts.md`,
 * `knowledge/pending/topics/2026-11-01.md`). Sync, since the files are small.
 */
export interface DataStore {
  /** The file's text, or null when it isn't there. */
  read(path: string): string | null;
  write(path: string, text: string): void;
  append(path: string, text: string): void;
  /** Deletes the file; nothing when it isn't there. */
  remove(path: string): void;
  /** The files under `dir` (paths relative to the data folder, recursive); empty when none. */
  list(dir: string): string[];
}

/** Asks Claude one question and gives its answer's text (no tools). */
export type AskClaude = (prompt: string) => Promise<string>;

/** One entry file of the chat bot's knowledge base, read as it is (read-only). */
export interface KnowledgeFile {
  /** The folder it's in under `knowledge/` (`douyin`, `zzz`, …). */
  folder: string;
  file: string;
  text: string;
}

/** The chat bot's `data/knowledge/`, which dy-browse only reads. */
export interface KnowledgeSource {
  files(): KnowledgeFile[];
}

/**
 * The JSON bodies the page fetched as it browsed, kept by what they are. Douyin's own scripts sign
 * those requests; we only read what comes back.
 */
export interface ResponseTap {
  /** The bodies (raw text) seen since the last drain, of this kind; empties them. */
  drain(kind: AnswerKind): string[];
}

/** What the chat bot's ASR and OCR workers make of one item's media. */
export interface BatchTranscriber {
  transcribe(
    path: string,
  ): Promise<{ sentences: string[]; song: { title: string; artist: string } | null }>;
  close(): Promise<void>;
}

export interface Ocr {
  read(images: readonly string[]): Promise<string[]>;
  close(): Promise<void>;
}

/** The media of one item, downloaded; deleted with `release`. */
export interface Media {
  /** The audio file for the transcriber. */
  audio: string | null;
  /** Keyframe images for OCR (or an image post's own images). */
  frames: string[];
  release(): Promise<void>;
}

export interface MediaFetcher {
  fetch(item: {
    id: string;
    playUrl: string | null;
    imageUrls: string[];
    url: string;
  }): Promise<Media>;
}
