import type { Gift } from '../core/room-events';
import type { Wallet } from '../core/wallet';
import { done, failed, type Command } from './command';

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
  /** Admins can change it while the bot runs. */
  cost: number;
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

  /**
   * Takes `price` (a mention's cost unless given, e.g. a command's) from the asker; an anonymous
   * one can never pay.
   */
  charge(userId: string | undefined, nickname: string, price = this.cost): Charge {
    if (price <= 0) return { ok: true, paid: 0 };
    if (userId && this.options.wallet.spend(userId, nickname, price)) {
      return { ok: true, paid: price };
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

  /** `/修改收费 2`: changes the price of a mention, until the bot stops. */
  commands(): Command[] {
    return [
      {
        name: '修改收费',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!/^\d+$/.test(args)) return failed('收费要写成钻石数，用法：/修改收费 2');
          this.cost = Number(args);
          return done('已处理修改收费请求');
        },
      },
    ];
  }

  /**
   * What a viewer who can't pay is told, after the @: that it's paid with the gifts they send the
   * streamer, never charged on top (viewers took 余额 for their own Douyin balance), what it costs,
   * and what they have left; for a mention, or for `command` when given.
   */
  lowBalanceNotice(userId: string | undefined, command?: { name: string; price: number }): string {
    const what = command ? `「${command.name}」` : '@我';
    const price = command ? command.price : this.cost;
    return `${what}要先给主播送礼：每次${price}钻，你送的还剩${this.balance(userId)}钻（不另外扣钱）`;
  }
}
