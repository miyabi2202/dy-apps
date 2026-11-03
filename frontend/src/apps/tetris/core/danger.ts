import { CONFIG } from './config';
import type { Board } from './types';

const { rows } = CONFIG.board;
/** The stack height, in rows, where danger starts. */
const FROM_ROWS = Math.round(rows * CONFIG.danger.fromHeight);

/** How many rows tall the stack is, from the floor to its highest cell. */
export function stackHeight(board: Board): number {
  const top = board.findIndex((row) => row.some(Boolean));
  return top === -1 ? 0 : rows - top;
}

/**
 * How close the stack is to the top: null while it is below `CONFIG.danger.fromHeight` of the
 * board, then from 0 (just in danger) towards 1 (at the top).
 */
export function dangerLevel(board: Board): number | null {
  const height = stackHeight(board);
  if (height < FROM_ROWS) return null;
  return Math.min(1, (height - FROM_ROWS) / (rows - FROM_ROWS));
}

/**
 * The heartbeat while in danger: a beat as soon as danger starts, then one every
 * `CONFIG.danger.beatSlowMs`, closer to `beatFastMs` the higher the stack.
 */
export class Heartbeat {
  /** Play time since the last beat; null while out of danger. */
  private sinceMs: number | null = null;

  /** Moves time on by `dtMs` at danger `level`; true when a beat is due now. */
  advance(dtMs: number, level: number | null): boolean {
    if (level === null) {
      this.sinceMs = null;
      return false;
    }
    if (this.sinceMs === null) {
      this.sinceMs = 0;
      return true;
    }
    this.sinceMs += dtMs;
    const { beatSlowMs, beatFastMs } = CONFIG.danger;
    if (this.sinceMs < beatSlowMs + (beatFastMs - beatSlowMs) * level) return false;
    this.sinceMs = 0;
    return true;
  }

  reset(): void {
    this.sinceMs = null;
  }
}
