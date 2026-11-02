import { CONFIG } from '../config';
import type { Sender } from '../types';

/** A viewer and how many likes they've given since the meter last filled. */
export interface Liker {
  sender: Sender;
  likes: number;
}

/** The like meter: likes so far towards the next curse, and who has liked most this time. */
export interface LikeMeterView {
  likes: number;
  threshold: number;
  top: Liker | null;
}

/** One time the meter filled: how many likes it took, and who gets the credit. */
export interface LikeFill {
  threshold: number;
  top: Liker;
}

const empty = (): LikeMeterView => ({
  likes: 0,
  threshold: CONFIG.likes.firstThreshold,
  top: null,
});

/**
 * The room's likes filling towards the next curse. It only counts and says when it filled; what
 * a fill draws is the caller's business. Each fill doubles the next threshold up to
 * CONFIG.likes.maxThreshold, and likes past it carry over as the last liker's. With no fill for
 * CONFIG.likes.idleResetMs it starts over.
 */
export class LikeMeter {
  view: LikeMeterView = empty();
  private likers = new Map<string, Liker>();
  /** When it last filled or started over, in the caller's clock. */
  private sinceMs = 0;

  /** `count` likes from `sender` at `nowMs`; returns each fill they caused, in order. */
  add(sender: Sender, count: number, nowMs: number): LikeFill[] {
    const mine = this.likers.get(sender.id);
    this.likers.set(sender.id, { sender, likes: (mine?.likes ?? 0) + count });
    let { likes, threshold } = this.view;
    likes += count;
    const fills: LikeFill[] = [];
    while (likes >= threshold) {
      likes -= threshold;
      fills.push({ threshold, top: this.topLiker()! });
      threshold = Math.min(threshold * 2, CONFIG.likes.maxThreshold);
      this.likers.clear();
      if (likes > 0) this.likers.set(sender.id, { sender, likes });
      this.sinceMs = nowMs;
    }
    this.view = { likes, threshold, top: this.topLiker() };
    return fills;
  }

  /** Starts over if it hasn't filled for a while; returns whether that changed anything. */
  idle(nowMs: number): boolean {
    if (nowMs - this.sinceMs < CONFIG.likes.idleResetMs) return false;
    this.sinceMs = nowMs;
    const { likes, threshold } = this.view;
    if (likes === 0 && threshold === CONFIG.likes.firstThreshold) return false;
    this.view = empty();
    this.likers.clear();
    return true;
  }

  reset(): void {
    this.view = empty();
    this.likers.clear();
    this.sinceMs = 0;
  }

  /** Whoever liked most; on a tie, whoever got there first. */
  private topLiker(): Liker | null {
    let top: Liker | null = null;
    for (const liker of this.likers.values()) if (!top || liker.likes > top.likes) top = liker;
    return top;
  }
}
