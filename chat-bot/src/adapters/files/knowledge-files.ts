import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseKnowledge, type KnowledgeEntry } from '../../core/knowledge/entries';

/**
 * The knowledge base in `dir` (data/knowledge/douyin/): every `.md` file in it, by name, read again
 * on every call so an edit applies at once. Empty when the folder isn't there.
 */
export function knowledgeFiles(dir: string): () => KnowledgeEntry[] {
  return () => {
    let names: string[];
    try {
      names = readdirSync(dir).filter((name) => name.endsWith('.md'));
    } catch {
      return [];
    }
    return names.sort().flatMap((name) => {
      try {
        return parseKnowledge(readFileSync(join(dir, name), 'utf8'));
      } catch {
        return [];
      }
    });
  };
}
