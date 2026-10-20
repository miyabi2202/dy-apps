import { readFileSync } from 'node:fs';
import { writeTextAtomic } from './atomic-file';
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
      writeTextAtomic(path, JSON.stringify(wallet, null, 2));
    },
  };
}
