import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Account, StoredWallet, WalletStorage } from '../core/wallet';

/**
 * Balances kept in a JSON file, `{ "savedAt": <ms>, "accounts": { <user id>: … } }`; an older file
 * that is just the accounts loads with no `savedAt`.
 */
export function jsonFileStorage(path: string): WalletStorage {
  return {
    load() {
      try {
        const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredWallet>;
        if (typeof raw.accounts === 'object' && raw.accounts !== null) {
          return { accounts: raw.accounts, savedAt: raw.savedAt };
        }
        return { accounts: raw as Record<string, Account> };
      } catch {
        return { accounts: {} };
      }
    },
    save(wallet) {
      writeJsonAtomic(path, wallet);
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
