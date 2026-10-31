import type { Embedder, VectorCache } from '../ports';

/**
 * The vectors a recall scores with: what's being said now, as queries, and what it looks through
 * (memories, knowledge entries), as documents. Shared by MemoryRecall and KnowledgeRecall.
 */
export class RecallVectors {
  /** The window's lines embedded as queries, by text, for `linesModel`. */
  private readonly lines = new Map<string, number[]>();
  private linesModel = '';

  constructor(
    private readonly embedder: Embedder,
    private readonly vectors: VectorCache,
  ) {}

  /**
   * Each line's vector as a query. A line stays in the window for many looks, so the latest are
   * kept here and only the new lines are embedded.
   */
  async queries(model: string, lines: readonly string[]): Promise<number[][]> {
    if (this.linesModel !== model) {
      this.lines.clear();
      this.linesModel = model;
    }
    const missing = [...new Set(lines.filter((line) => !this.lines.has(line)))];
    if (missing.length) {
      const made = await this.embedder.embed(missing, 'query');
      missing.forEach((line, i) => this.lines.set(line, made[i]!));
    }
    const vectors = lines.map((line) => this.lines.get(line)!);
    // Keep only what the window still has, so it doesn't grow over a long stream.
    for (const line of this.lines.keys()) if (!lines.includes(line)) this.lines.delete(line);
    return vectors;
  }

  /** Each text's vector: from the cache, or embedded now (and cached) for the ones it hasn't. */
  async documents(model: string, texts: readonly string[]): Promise<number[][]> {
    const cached = this.vectors.get(model, texts);
    const missing = [...new Set(texts.filter((_, i) => !cached[i]))];
    if (missing.length) {
      const made = await this.embedder.embed(missing, 'document');
      this.vectors.put(
        model,
        missing.map((text, i) => [text, made[i]!] as const),
      );
    }
    const now = this.vectors.get(model, texts);
    return now.map((vector) => vector ?? []);
  }
}
