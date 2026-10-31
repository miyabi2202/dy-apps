import { errorMessage } from '../../core/errors';
import {
  bestOfLines,
  combinedScore,
  pinyinScores,
  recalled,
  recallLines,
  similarity,
  withoutNames,
} from '../../core/memory/recall';
import type { LifeDay } from '../../core/prompts/life';
import type { Embedder, LifeLog, Log, Thoughts, VectorCache } from '../ports';

export interface MemoryRecallOptions {
  /** The local embedding service; null without one, and then only the latest are shown. */
  embedder: Embedder | null;
  vectors: VectorCache;
  /** The bot's thoughts after the room's streams. */
  thoughts: Pick<Thoughts, 'all'>;
  /** The shared personas' own days. */
  life: Pick<LifeLog, 'recent'>;
  /** The shared persona the room plays now; none for no days of her own. */
  persona: () => string | undefined;
  /** What's being said now: the streamer's recent lines and the recent chats, oldest first. */
  speech: () => string[];
  chat: () => string[];
  /** What the bot is called here (its nickname, the room's aliases), left out of the sound match. */
  names: () => string[];
  log: Log;
  /** How much the sound match counts next to the meaning, and its scale (see combinedScore). */
  pinyinWeight?: number;
  pinyinScale?: number;
  /** How many of the latest thoughts, and of her latest days, every prompt shows as before. */
  recentThoughts?: number;
  recentDays?: number;
  /** At most this many older ones come to mind besides, of each. */
  extra?: number;
  /** How long after the room last said something it looks again, so a burst of chat is one look. */
  debounceMs?: number;
  setTimer?: (run: () => void, ms: number) => () => void;
}

/** One line of a day of hers that came to mind. */
interface RecalledLine {
  date: string;
  line: string;
}

/** A thought line's text without the day it's about: `2026-10-31：…` → `…`. */
const thoughtText = (line: string) => line.replace(/^[^：]*：/, '');

/** Keeps how many days back her older days are looked through. */
const LIFE_DAYS_LOOKED_AT = 365;

/**
 * What the bot remembers of its own, for every prompt: its latest thoughts after the room's
 * streams and the latest days of the persona it plays, as before, and besides, older ones that
 * fit what's being said now. After the room says something (a chat, the streamer's speech) it
 * waits `debounceMs`, then scores each older thought and day against each line being said now (the
 * streamer's last lines and the last chats, see recallLines): mostly by meaning (the embedding
 * service's cosine), a little by sound (pinyin BM25, with the bot's own names left out, so a word
 * heard wrong still matches). A memory scores its best line (bestOfLines), and those scoring at
 * least the model's cutoff come to mind, the highest first, at most `extra` of each. The best scores go to the log
 * (debug, `memory recall`), to set the cutoff from real rooms. Building a prompt never waits for that: it shows what was found last.
 * Without the service (not running, or an error) only the latest are shown, and the failure is
 * warned about once until it works again.
 */
export class MemoryRecall {
  private oldThoughts: string[] = [];
  private oldLife: { persona: string; lines: RecalledLine[] } | undefined;
  private lastQuery = '';
  private cancel: (() => void) | undefined;
  private looking = false;
  private again = false;
  private failing = false;
  /** The window's lines embedded as queries, by text, for `linesModel`. */
  private readonly lines = new Map<string, number[]>();
  private linesModel = '';

  constructor(private readonly options: MemoryRecallOptions) {}

  /** The room said something: look again a moment after it's quiet. */
  hear(): void {
    const { embedder, debounceMs = 1500 } = this.options;
    if (!embedder) return;
    const { setTimer = defaultTimer } = this.options;
    this.cancel?.();
    this.cancel = setTimer(() => void this.refresh(), debounceMs);
  }

  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
  }

  /** The thoughts every prompt shows, a line each, oldest first. */
  thoughtsText(): string {
    const { thoughts, recentThoughts = 6 } = this.options;
    const recent = thoughts.all().slice(-recentThoughts);
    const older = this.oldThoughts.filter((line) => !recent.includes(line));
    return [...older, ...recent].join('\n');
  }

  /** The days of `persona`'s that her persona shows: older lines that came to mind, then her latest days. */
  lifeDays(persona: string): LifeDay[] {
    const { life, recentDays = 5 } = this.options;
    const recent = life.recent(persona, recentDays);
    const dates = new Set(recent.map(({ date }) => date));
    const older =
      this.oldLife?.persona === persona
        ? this.oldLife.lines.filter(({ date }) => !dates.has(date))
        : [];
    const byDate = new Map<string, string[]>();
    for (const { date, line } of older) byDate.set(date, [...(byDate.get(date) ?? []), line]);
    return [...[...byDate].map(([date, lines]) => ({ date, text: lines.join('\n') })), ...recent];
  }

  /** Looks again now; resolves once it has. */
  async refresh(): Promise<void> {
    if (this.looking) {
      this.again = true;
      return;
    }
    this.looking = true;
    try {
      do {
        this.again = false;
        await this.look();
      } while (this.again);
    } finally {
      this.looking = false;
    }
  }

  private async look(): Promise<void> {
    const { embedder, log, speech, chat, extra = 3 } = this.options;
    if (!embedder) return;
    const lines = recallLines(speech(), chat());
    const query = lines.join('\n');
    if (!query || query === this.lastQuery) return;
    try {
      const { model, cutoff } = await embedder.info();
      const thoughts = this.olderThoughts();
      const persona = this.options.persona();
      const days = persona ? this.olderLife(persona) : [];
      const texts = [...thoughts.map(thoughtText), ...days.map(({ line }) => line)];
      const queryVectors = await this.lineVectors(model, lines);
      const docs = await this.documentVectors(model, texts);
      const { names, pinyinWeight: weight, pinyinScale: scale } = this.options;
      const botNames = names();
      // Each memory against each line, meaning and sound; a memory scores its best line.
      const perLine = lines.map((line, l) => {
        const sounds = pinyinScores(texts, withoutNames(line, botNames));
        return docs.map((vector, i) =>
          combinedScore(similarity(queryVectors[l]!, vector), sounds[i]!, { weight, scale }),
        );
      });
      const scores = bestOfLines(perLine);
      log.debug('memory recall', {
        best: scores
          .map((score, i) => ({
            score: Math.round(score * 1000) / 1000,
            text: texts[i],
            line: lines[perLine.findIndex((each) => each[i] === score)],
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
        cutoff,
      });
      this.lastQuery = query;
      if (this.failing) log.info('memory recall works again', { model });
      this.failing = false;
      if (cutoff === null) {
        // Without a measured cutoff anything would come to mind: only the latest are shown.
        this.oldThoughts = [];
        this.oldLife = undefined;
        return;
      }
      const pick = (from: number, count: number) =>
        recalled(scores.slice(from, from + count), { cutoff, max: extra });
      this.oldThoughts = pick(0, thoughts.length).map((i) => thoughts[i]!);
      this.oldLife = persona
        ? { persona, lines: pick(thoughts.length, days.length).map((i) => days[i]!) }
        : undefined;
    } catch (err) {
      this.oldThoughts = [];
      this.oldLife = undefined;
      if (!this.failing) {
        log.warn('memory recall is off: the embedding service did not answer', {
          error: errorMessage(err),
        });
      }
      this.failing = true;
    }
  }

  /** The thoughts older than those every prompt shows. */
  private olderThoughts(): string[] {
    const { thoughts, recentThoughts = 6 } = this.options;
    const all = thoughts.all();
    return all.slice(0, Math.max(0, all.length - recentThoughts));
  }

  /** The lines of her days older than those her persona shows. */
  private olderLife(persona: string): RecalledLine[] {
    const { life, recentDays = 5 } = this.options;
    const days = life.recent(persona, LIFE_DAYS_LOOKED_AT);
    return days.slice(0, Math.max(0, days.length - recentDays)).flatMap(({ date, text }) =>
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ date, line })),
    );
  }

  /**
   * Each line's vector as a query. A line stays in the window for many looks, so the latest are
   * kept here and only the new lines are embedded.
   */
  private async lineVectors(model: string, lines: readonly string[]): Promise<number[][]> {
    if (this.linesModel !== model) {
      this.lines.clear();
      this.linesModel = model;
    }
    const missing = [...new Set(lines.filter((line) => !this.lines.has(line)))];
    if (missing.length) {
      const made = await this.options.embedder!.embed(missing, 'query');
      missing.forEach((line, i) => this.lines.set(line, made[i]!));
    }
    const vectors = lines.map((line) => this.lines.get(line)!);
    // Keep only what the window still has, so it doesn't grow over a long stream.
    for (const line of this.lines.keys()) if (!lines.includes(line)) this.lines.delete(line);
    return vectors;
  }

  /** Each text's vector: from the cache, or embedded now (and cached) for the ones it hasn't. */
  private async documentVectors(model: string, texts: readonly string[]): Promise<number[][]> {
    const { embedder, vectors } = this.options;
    const cached = vectors.get(model, texts);
    const missing = [...new Set(texts.filter((_, i) => !cached[i]))];
    if (missing.length) {
      const made = await embedder!.embed(missing, 'document');
      vectors.put(
        model,
        missing.map((text, i) => [text, made[i]!] as const),
      );
    }
    const now = vectors.get(model, texts);
    return now.map((vector) => vector ?? []);
  }
}

function defaultTimer(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}
