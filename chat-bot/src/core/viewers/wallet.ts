/** One viewer's account, in diamonds (抖币). */
export interface Account {
  nickname: string;
  /** Everything they've gifted in this room while the bot was listening. */
  gifted: number;
  /** What their @mentions have cost. */
  spent: number;
}

/** The accounts as stored, with when they were last saved (ms), unknown for an old file. */
export interface StoredWallet {
  accounts: Record<string, Account>;
  savedAt?: number;
}

/** Where accounts are kept between runs. */
export interface WalletStorage {
  load(): StoredWallet;
  save(wallet: StoredWallet): void;
}

/** Viewers' balances, keyed by Douyin user id: gifts add to them, @mentions spend them. */
export class Wallet {
  private readonly accounts: Record<string, Account>;
  private savedAt: number | undefined;
  private readonly now: () => number;

  constructor(
    private readonly storage: WalletStorage,
    { now = Date.now }: { now?: () => number } = {},
  ) {
    ({ accounts: this.accounts, savedAt: this.savedAt } = storage.load());
    this.now = now;
  }

  balance(userId: string): number {
    const account = this.accounts[userId];
    return account ? account.gifted - account.spent : 0;
  }

  credit(userId: string, nickname: string, diamonds: number): void {
    const account = this.account(userId, nickname);
    account.gifted += diamonds;
    this.save();
  }

  /** Takes `diamonds` from the balance if it covers them, and says whether it did. */
  spend(userId: string, nickname: string, diamonds: number): boolean {
    if (this.balance(userId) < diamonds) return false;
    this.account(userId, nickname).spent += diamonds;
    this.save();
    return true;
  }

  /** Gives back what `spend` took, when the mention couldn't be answered. */
  refund(userId: string, diamonds: number): void {
    const account = this.accounts[userId];
    if (!account) return;
    account.spent -= diamonds;
    this.save();
  }

  /** Forgets every balance. */
  clear(): void {
    for (const userId of Object.keys(this.accounts)) delete this.accounts[userId];
    this.save();
  }

  /**
   * Forgets every balance if they were last saved more than `ms` ago (or when, isn't known): on
   * start, so balances outlast a restart but not a day off.
   */
  clearIfOlderThan(ms: number): void {
    if (this.savedAt === undefined || this.now() - this.savedAt > ms) this.clear();
  }

  /** Saves the balances as they are, as of now: on exit, so a restart counts from then. */
  touch(): void {
    this.save();
  }

  private save(): void {
    this.savedAt = this.now();
    this.storage.save({ accounts: this.accounts, savedAt: this.savedAt });
  }

  private account(userId: string, nickname: string): Account {
    const account = (this.accounts[userId] ??= { nickname, gifted: 0, spent: 0 });
    account.nickname = nickname;
    return account;
  }
}
