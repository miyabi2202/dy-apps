import { errorMessage } from '../../core/errors';
import { knowledgeText, mentioned, type KnowledgeEntry } from '../../core/knowledge/entries';
import {
  bestOfLines,
  combinedScore,
  pinyinScores,
  recalled,
  recallLines,
  similarity,
  withoutNames,
} from '../../core/memory/recall';
import { RecallVectors } from '../memory/recall-vectors';
import type { Embedder, Log, VectorCache } from '../ports';

export interface KnowledgeRecallOptions {
  /** The local embedding service; null without one, and then only entries named in the room come to mind. */
  embedder: Embedder | null;
  vectors: VectorCache;
  /** The knowledge base, read again on every call. */
  entries: () => KnowledgeEntry[];
  /** What's being said now: the streamer's recent lines and the recent chats, oldest first. */
  speech: () => string[];
  chat: () => string[];
  /** What the bot is called here, left out of the sound match. */
  names: () => string[];
  log: Log;
  /** While all of the knowledge is at most this many characters, every prompt shows all of it. */
  wholeUnder?: number;
  /** At most this many entries come to mind at once. */
  max?: number;
  pinyinWeight?: number;
  pinyinScale?: number;
  /** How long after the room last said something it looks again, so a burst of chat is one look. */
  debounceMs?: number;
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * The knowledge base (data/knowledge/douyin/) for every prompt, in `{{commonKnowledge}}`. While it's
 * small (`wholeUnder`) every prompt shows all of it. Once it's bigger, only the entries that fit what's
 * being said: a moment after the room says something it looks at the streamer's last lines and the
 * last chats (see recallLines), and first takes the entries whose heading or an alias is said in them,
 * a name being a fixed phrase that meaning would blur; then, with the embedding service, the entries
 * that score at least the model's cutoff, scored like MemoryRecall's memories (meaning and sound,
 * each entry its best line). At most `max` in all, those named first, in the knowledge base's order.
 * The best scores go to the log (debug, `knowledge recall`), to measure a cutoff of knowledge's own.
 * Building a prompt never waits: it shows what was found last. Without the service only the named
 * entries come to mind, and the failure is warned about once until it works again.
 */
export class KnowledgeRecall {
  /** The headings of the entries that came to mind last. */
  private picked: string[] = [];
  private lastQuery = '';
  private cancel: (() => void) | undefined;
  private looking = false;
  private again = false;
  private failing = false;
  private readonly vectors: RecallVectors | undefined;

  constructor(private readonly options: KnowledgeRecallOptions) {
    const { embedder, vectors } = options;
    this.vectors = embedder ? new RecallVectors(embedder, vectors) : undefined;
  }

  /** The room said something: look again a moment after it's quiet. */
  hear(): void {
    const { debounceMs = 1500, setTimer = defaultTimer } = this.options;
    this.cancel?.();
    this.cancel = setTimer(() => void this.refresh(), debounceMs);
  }

  stop(): void {
    this.cancel?.();
    this.cancel = undefined;
  }

  /** What the prompt shows of the knowledge base: all of it while it's small, else what came to mind last. */
  text(): string {
    const entries = this.options.entries();
    if (this.whole(entries)) return knowledgeText(entries);
    return knowledgeText(entries.filter(({ title }) => this.picked.includes(title)));
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

  private whole(entries: readonly KnowledgeEntry[]): boolean {
    const { wholeUnder = 8000 } = this.options;
    return knowledgeText(entries).length <= wholeUnder;
  }

  private async look(): Promise<void> {
    const { speech, chat, max = 3 } = this.options;
    const entries = this.options.entries();
    if (this.whole(entries)) return;
    const lines = recallLines(speech(), chat());
    const query = lines.join('\n');
    if (!query || query === this.lastQuery) return;
    this.lastQuery = query;
    const named = mentioned(entries, lines).slice(0, max);
    const fitting = await this.fitting(entries, lines, named, max - named.length);
    const picked = new Set([...named, ...fitting]);
    this.picked = entries.filter((_, i) => picked.has(i)).map(({ title }) => title);
  }

  /** Up to `count` entries besides `named` that fit the lines by meaning and sound; none without the service. */
  private async fitting(
    entries: readonly KnowledgeEntry[],
    lines: readonly string[],
    named: readonly number[],
    count: number,
  ): Promise<number[]> {
    const { embedder, log } = this.options;
    const vectors = this.vectors;
    if (!embedder || !vectors || count <= 0) return [];
    try {
      const { model, cutoff } = await embedder.info();
      const texts = entries.map(({ text }) => text);
      const queryVectors = await vectors.queries(model, lines);
      const docs = await vectors.documents(model, texts);
      const { names, pinyinWeight: weight, pinyinScale: scale } = this.options;
      const botNames = names();
      const perLine = lines.map((line, l) => {
        const sounds = pinyinScores(texts, withoutNames(line, botNames));
        return docs.map((vector, i) =>
          combinedScore(similarity(queryVectors[l]!, vector), sounds[i]!, { weight, scale }),
        );
      });
      const scores = bestOfLines(perLine);
      log.debug('knowledge recall', {
        best: scores
          .map((score, i) => ({
            score: Math.round(score * 1000) / 1000,
            title: entries[i]!.title,
            line: lines[perLine.findIndex((each) => each[i] === score)],
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3),
        named: named.map((i) => entries[i]!.title),
        cutoff,
      });
      if (this.failing) log.info('knowledge recall works again', { model });
      this.failing = false;
      // Without a measured cutoff anything would come to mind: only the named ones do.
      if (cutoff === null) return [];
      const others = scores.map((score, i) => (named.includes(i) ? -Infinity : score));
      return recalled(others, { cutoff, max: count });
    } catch (err) {
      if (!this.failing) {
        log.warn(
          'knowledge recall finds named entries only: the embedding service did not answer',
          {
            error: errorMessage(err),
          },
        );
      }
      this.failing = true;
      return [];
    }
  }
}

function defaultTimer(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms);
  return () => clearTimeout(timer);
}
