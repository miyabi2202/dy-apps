import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VectorCache } from '../../app/ports';

/** The file name for `model`'s vectors: `Qwen/Qwen3-Embedding-0.6B` → `qwen-qwen3-embedding-0-6b.json`. */
function fileOf(model: string): string {
  return `${model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.json`;
}

const keyOf = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);

/**
 * The vectors made for stored memories, in `dir` (data/embeddings/): a file per model, each text's
 * vector under a hash of the text, shared by every room's bot. A changed or new text is a new
 * entry, so a memory edited by hand is embedded again; another model starts its own file. Each
 * write first reads what's there, so two bots adding at once lose nothing but what both added
 * in the same instant, which is only embedded again.
 */
export function vectorFiles(dir: string): VectorCache {
  const loaded = new Map<string, Record<string, number[]>>();
  const read = (model: string): Record<string, number[]> => {
    try {
      return JSON.parse(readFileSync(join(dir, fileOf(model)), 'utf8')) as Record<string, number[]>;
    } catch {
      return {};
    }
  };
  const vectorsOf = (model: string) => {
    let vectors = loaded.get(model);
    if (!vectors) loaded.set(model, (vectors = read(model)));
    return vectors;
  };
  return {
    get(model, texts) {
      const vectors = vectorsOf(model);
      return texts.map((text) => vectors[keyOf(text)]);
    },
    put(model, entries) {
      if (!entries.length) return;
      const vectors = { ...read(model), ...vectorsOf(model) };
      for (const [text, vector] of entries) vectors[keyOf(text)] = vector;
      loaded.set(model, vectors);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, fileOf(model));
      writeFileSync(`${path}.tmp`, JSON.stringify(vectors));
      renameSync(`${path}.tmp`, path);
    },
  };
}
