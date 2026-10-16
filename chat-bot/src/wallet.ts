import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** One viewer's account, in diamonds (抖币). */
export interface Account {
  nickname: string;
  /** Everything they've gifted in this room while the bot was listening. */
  gifted: number;
  /** What their @mentions have cost. */
  spent: number;
}

/** Where accounts are kept between runs. */
export interface WalletStorage {
  load(): Record<string, Account>;
  save(accounts: Record<string, Account>): void;
}

/** A JSON file, written to a temporary file first so a crash never leaves half of one. */
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
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(accounts, null, 2));
      renameSync(`${path}.tmp`, path);
    },
  };
}

/** Viewers' balances, keyed by Douyin user id: gifts add to them, @mentions spend them. */
export class Wallet {
  private readonly accounts: Record<string, Account>;

  constructor(private readonly storage: WalletStorage) {
    this.accounts = storage.load();
  }

  balance(userId: string): number {
    const account = this.accounts[userId];
    return account ? account.gifted - account.spent : 0;
  }

  credit(userId: string, nickname: string, diamonds: number): void {
    const account = this.account(userId, nickname);
    account.gifted += diamonds;
    this.storage.save(this.accounts);
  }

  /** Takes `diamonds` from the balance if it covers them, and says whether it did. */
  spend(userId: string, nickname: string, diamonds: number): boolean {
    if (this.balance(userId) < diamonds) return false;
    this.account(userId, nickname).spent += diamonds;
    this.storage.save(this.accounts);
    return true;
  }

  /** Gives back what `spend` took, when the mention couldn't be answered. */
  refund(userId: string, diamonds: number): void {
    const account = this.accounts[userId];
    if (!account) return;
    account.spent -= diamonds;
    this.storage.save(this.accounts);
  }

  /** Forgets every balance. */
  clear(): void {
    for (const userId of Object.keys(this.accounts)) delete this.accounts[userId];
    this.storage.save(this.accounts);
  }

  private account(userId: string, nickname: string): Account {
    const account = (this.accounts[userId] ??= { nickname, gifted: 0, spent: 0 });
    account.nickname = nickname;
    return account;
  }
}
