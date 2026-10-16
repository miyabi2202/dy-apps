import type { Gift } from '../core/room-events';
import type { Wallet } from '../core/wallet';

export interface BillingOptions {
  wallet: Wallet;
  /** Diamonds one @mention costs; 0 makes them free. */
  cost?: number;
  /** Tell a viewer their balance is too low at most this often. */
  noticeCooldownMs?: number;
  now?: () => number;
}

/** What charging for a mention came to. */
export type Charge =
  | { ok: true; paid: number }
  /** They can't pay; `notify` when it's time to tell them again. */
  | { ok: false; notify: boolean };

/**
 * Viewers pay for @mentions with what they've gifted: each gift adds its diamonds, each mention
 * costs `cost`, and a mention that can't be answered is refunded. A viewer who can't pay is told
 * so at most once per `noticeCooldownMs`.
 */
export class Billing {
  readonly cost: number;
  readonly noticeCooldownMs: number;
  /** When each viewer was last told their balance is too low. */
  private readonly noticedAt = new Map<string, number>();
  private readonly now: () => number;

  constructor(private readonly options: BillingOptions) {
    this.cost = options.cost ?? 1;
    this.noticeCooldownMs = options.noticeCooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  credit(gift: Gift): void {
    this.options.wallet.credit(gift.userId, gift.nickname, gift.diamonds);
  }

  balance(userId: string | undefined): number {
    return userId ? this.options.wallet.balance(userId) : 0;
  }

  /** Takes the price of one mention from the asker, an anonymous one never able to pay. */
  charge(userId: string | undefined, nickname: string): Charge {
    if (this.cost <= 0) return { ok: true, paid: 0 };
    if (userId && this.options.wallet.spend(userId, nickname, this.cost)) {
      return { ok: true, paid: this.cost };
    }
    const key = userId ?? nickname;
    const last = this.noticedAt.get(key);
    const now = this.now();
    if (last !== undefined && now - last < this.noticeCooldownMs)
      return { ok: false, notify: false };
    this.noticedAt.set(key, now);
    return { ok: false, notify: true };
  }

  refund(userId: string | undefined, paid: number): void {
    if (userId && paid) this.options.wallet.refund(userId, paid);
  }

  /** What a viewer who can't pay is told, after the @. */
  lowBalanceNotice(): string {
    return `你的余额不足，每次@需要${this.cost}钻（${Math.round(this.noticeCooldownMs / 1000)}秒内只提醒一次）`;
  }
}
