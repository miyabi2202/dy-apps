import { CONFIG } from '../config';
import type { Rarity } from '../curses';
import { SYSTEM_SENDER } from '../interventions';
import type { Sender } from '../types';

/** One viewer on the MVP board. */
export interface MvpEntry {
  readonly sender: Sender;
  readonly points: number;
  /** Their curses that fired. */
  readonly curses: number;
  /** Whether one of their curses ended the game. */
  readonly finalBlow: boolean;
}

type Tally = { -readonly [K in keyof MvpEntry]: MvpEntry[K] };

/** What one fired curse is worth: 1 / its rarity's weight, so rarer curses count for more. */
export function mvpPoints(rarity: Rarity): number {
  return Math.round(1 / CONFIG.gifts.rarityWeights[rarity]);
}

/**
 * Who hurt the streamer most this game: each viewer's fired curses, worth more the rarer they
 * are, and whose curse ended it. Curses the game drew itself don't count.
 */
export class MvpBoard {
  private readonly entries = new Map<string, Tally>();

  /** A curse from `sender` fired. */
  credit(sender: Sender | null, rarity: Rarity): void {
    const entry = this.entryFor(sender);
    if (!entry) return;
    entry.points += mvpPoints(rarity);
    entry.curses += 1;
  }

  /** A curse from `sender` ended the game. */
  finalBlow(sender: Sender | null): void {
    const entry = this.entryFor(sender);
    if (entry) entry.finalBlow = true;
  }

  /** Most points first; a tie goes to more curses, then to whoever got there first. */
  get standings(): readonly MvpEntry[] {
    return [...this.entries.values()].sort((a, b) => b.points - a.points || b.curses - a.curses);
  }

  reset(): void {
    this.entries.clear();
  }

  private entryFor(sender: Sender | null): Tally | null {
    if (!sender || sender.id === SYSTEM_SENDER.id) return null;
    let entry = this.entries.get(sender.id);
    if (!entry) {
      entry = { sender, points: 0, curses: 0, finalBlow: false };
      this.entries.set(sender.id, entry);
    }
    return entry;
  }
}
