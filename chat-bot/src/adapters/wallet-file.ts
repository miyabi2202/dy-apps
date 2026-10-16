import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Account, WalletStorage } from '../core/wallet';

/** Balances kept in a JSON file. */
export function jsonFileStorage(path: string): WalletStorage {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Account>;
      } catch {
        return {};
      }
    },
    save(accounts) {
      writeJsonAtomic(path, accounts);
    },
  };
}

/**
 * Writes `value` as JSON to a temporary file and renames it into place, so a crash never leaves
 * half a file.
 */
function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${path}.tmp`, path);
}
