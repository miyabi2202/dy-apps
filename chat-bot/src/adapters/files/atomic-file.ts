import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Writes `text` to a temporary file and renames it into place, so a crash never leaves half a file
 * and something reading it as it changes never sees one.
 */
export function writeTextAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, text);
  renameSync(`${path}.tmp`, path);
}
