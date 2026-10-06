import { addMessage, type DanmakuMessage } from '@dy-apps/services';
import { CONFIG, EFFECT_POOL } from './core/config';
import type { GameEngine, GiftResponse } from './core/game';
import type { EffectType } from './core/types';
import { effectName } from './ui/format';

/** Cards kept on the gift wall; older ones are dropped. */
const MAX_CARDS = 200;

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

  constructor(private readonly engine: GameEngine) {}

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
    if (!response.ok) return response;

    this.drawn.set(message.id, drawn);
    this.messages = addMessage(this.messages, { ...message, detail: curseText(drawn) }, MAX_CARDS);
    if (this.drawn.size > MAX_CARDS * 2) this.forgetDropped();
    this.emit();
    return response;
  }

  /** Empties the wall, for a new game. */
  clear(): void {
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

/** 触发 垃圾行×1、迷雾×2, or 未触发诅咒. */
function curseText(drawn: Drawn): string {
  const parts = EFFECT_POOL.filter((type) => drawn[type]).map(
    (type) => `${effectName(type)}×${drawn[type]}`,
  );
  return parts.length ? `触发 ${parts.join('、')}` : '未触发诅咒';
}
