import { CONFIG } from '../config';

/**
 * Counts settlements in a row with nothing pending; after CONFIG.quiet.settlements of them it
 * says to draw a curse, and starts counting again.
 */
export class QuietRoom {
  settlements = 0;

  /** At a settlement, with `pending` curses waiting: whether the game should draw one itself. */
  afterSettlement(pending: number): boolean {
    if (pending > 0) {
      this.settlements = 0;
      return false;
    }
    this.settlements += 1;
    if (this.settlements < CONFIG.quiet.settlements) return false;
    this.settlements = 0;
    return true;
  }

  reset(): void {
    this.settlements = 0;
  }
}
