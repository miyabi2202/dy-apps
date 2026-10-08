import { addMessage, type DanmakuMessage, type DetailPart, type Logger } from '@dy-apps/services';
import { CONFIG } from './core/config';
import { CURSES, EFFECT_POOL, type EffectType } from './core/curses';
import type { GameEngine, GiftResponse } from './core/game';
import { log as appLog } from './log';
import { RARITY_COLORS } from './ui/rarity';

/** Cards kept on the gift wall; older ones are dropped. */
const MAX_CARDS = 200;

/** Gifts logged one by one per second; the rest of a busy second become one summary line. */
const LOGGED_PER_WINDOW = 5;
const LOG_WINDOW_MS = 1000;

export interface GiftFeedOptions {
  /** Where debug messages go; the app's `[tetris]` log by default. */
  logger?: Logger;
  /** The clock for the log's rate limit; `performance.now` by default. */
  now?: () => number;
}

type Drawn = Partial<Record<EffectType, number>>;

/**
 * Sends gifts into the game and keeps a message card for each, with the curses it drew,
 * for the wall beside the board. A combo's later gifts add to its card.
 */
export class GiftFeed {
  private messages: readonly DanmakuMessage[] = [];
  /** Curses drawn so far per card, so a combo's card shows its whole total. */
  private readonly drawn = new Map<string, Drawn>();
  private readonly listeners = new Set<() => void>();

  private readonly logger: Logger;
  private readonly now: () => number;
  private windowStart = -Infinity;
  private loggedInWindow = 0;
  private unlisted = { gifts: 0, diamonds: 0 };

  constructor(
    private readonly engine: GameEngine,
    { logger = appLog, now = () => performance.now() }: GiftFeedOptions = {},
  ) {
    this.logger = logger;
    this.now = now;
  }

  /**
   * Sends a gift message into the game and adds its card. Each diamond the gifts are worth
   * (`gift.count` × `gift.diamonds`, 1 when the price is missing) is one draw at the trigger
   * chance. Gifts the game doesn't take (before it starts, after it ends, or an invalid
   * count) get no card.
   */
  send(message: DanmakuMessage): GiftResponse {
    const drawn = { ...this.drawn.get(message.id) };
    // Assigned on the first pass: batches() is never empty.
    let response!: GiftResponse;
    for (const count of batches(diamondsOf(message))) {
      response = this.engine.sendGifts(message.user.nickname, count);
      if (!response.ok) break;
      for (const type of EFFECT_POOL) {
        const n = response.result.effects[type];
        if (n) drawn[type] = (drawn[type] ?? 0) + n;
      }
    }
    this.logGift(message, response);
    if (!response.ok) return response;

    this.drawn.set(message.id, drawn);
    this.messages = addMessage(
      this.messages,
      { ...message, detail: curseDetail(drawn) },
      MAX_CARDS,
    );
    if (this.drawn.size > MAX_CARDS * 2) this.forgetDropped();
    this.emit();
    return response;
  }

  /**
   * One debug line per gift, at most LOGGED_PER_WINDOW a second: a busy room's other gifts are
   * counted and summed up in one line when the next second starts.
   */
  private logGift(message: DanmakuMessage, response: GiftResponse): void {
    if (!this.logger.enabled('debug')) return;
    const { user, gift } = message;
    const diamonds = diamondsOf(message);
    const t = this.now();
    if (t - this.windowStart >= LOG_WINDOW_MS) {
      this.flushUnlisted();
      this.windowStart = t;
      this.loggedInWindow = 0;
    }
    if (this.loggedInWindow >= LOGGED_PER_WINDOW) {
      this.unlisted.gifts += 1;
      this.unlisted.diamonds += diamonds;
      return;
    }
    this.loggedInWindow += 1;
    const what = `${user.nickname} ${gift?.name ?? '?'}x${gift?.count ?? 0} (${diamonds} diamonds)`;
    if (!response.ok) {
      this.logger.debug(`gift ignored, ${what}: ${response.error}`);
      return;
    }
    const { hits, effects } = response.result;
    const drew = EFFECT_POOL.filter((type) => effects[type]).map(
      (type) => `${type}x${effects[type]}`,
    );
    this.logger.debug(`gift ${what} -> ${hits} hits${drew.length ? `: ${drew.join(' ')}` : ''}`);
  }

  private flushUnlisted(): void {
    const { gifts, diamonds } = this.unlisted;
    if (gifts === 0) return;
    this.logger.debug(`${gifts} more gifts (${diamonds} diamonds) in that second, not listed`);
    this.unlisted = { gifts: 0, diamonds: 0 };
  }

  /** Empties the wall, for a new game. */
  clear(): void {
    this.flushUnlisted();
    this.messages = [];
    this.drawn.clear();
    this.emit();
  }

  getMessages = (): readonly DanmakuMessage[] => this.messages;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private forgetDropped(): void {
    const kept = new Set(this.messages.map((m) => m.id));
    for (const id of this.drawn.keys()) if (!kept.has(id)) this.drawn.delete(id);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** What a gift message is worth in diamonds: one draw each. */
function diamondsOf({ gift }: DanmakuMessage): number {
  return (gift?.count ?? 0) * (gift?.diamonds || 1);
}

/** Starts a new game: the board and curses are reset, and the gift wall emptied. */
export function newGame(engine: GameEngine, feed: GiftFeed): void {
  engine.restart();
  feed.clear();
}

/** A big gift is worth more draws than one batch allows, so split it. Never empty. */
function batches(count: number): number[] {
  const { maxBatch } = CONFIG.gifts;
  if (count <= maxBatch) return [count];
  const out: number[] = [];
  for (let left = count; left > 0; left -= maxBatch) out.push(Math.min(left, maxBatch));
  return out;
}

/** 触发 垃圾行×1、迷雾×2 (each name in its rarity's colour), or 未触发诅咒. */
function curseDetail(drawn: Drawn): DetailPart[] {
  const types = EFFECT_POOL.filter((type) => drawn[type]);
  if (types.length === 0) return [{ text: '未触发诅咒' }];
  const parts: DetailPart[] = [{ text: '触发 ' }];
  types.forEach((type, i) => {
    const def = CURSES[type];
    parts.push({ text: def.name, color: RARITY_COLORS[def.rarity] });
    parts.push({ text: `×${drawn[type]}${i < types.length - 1 ? '、' : ''}` });
  });
  return parts;
}
