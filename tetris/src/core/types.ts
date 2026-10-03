export type EffectType = 'garbage' | 'haste' | 'fog' | 'seal';
export type Phase = 'ready' | 'playing' | 'paused' | 'gameOver';
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** A board cell: empty, a locked piece colour, or garbage. */
export type Cell = PieceType | 'G' | null;
export type Board = Cell[][];

export type Matrix = number[][];

export interface ActivePiece {
  type: PieceType;
  matrix: Matrix;
  x: number;
  y: number;
}

export interface TeamState {
  /** Triggered curses waiting to fire, per type. */
  pending: Record<EffectType, number>;
  giftCount: number;
  hitCount: number;
  missCount: number;
  /** Curses that have fired at a settlement. */
  firedCount: number;
  /** Pending garbage removed by line clears. */
  canceledCount: number;
}

export interface GiftBatchResult {
  sender: string;
  count: number;
  triggerProbability: number;
  hits: number;
  misses: number;
  /** Curses drawn in this batch, per type. */
  effects: Partial<Record<EffectType, number>>;
}

export interface TimedPieceEffect {
  remainingLocks: number;
}

export interface GiftBatchInput {
  sender: string;
  /** Positive integer, 1..maxBatch. */
  count: number;
}
