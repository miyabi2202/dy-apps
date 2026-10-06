import type { EffectType } from './curses';

export type Phase = 'ready' | 'playing' | 'paused' | 'gameOver';
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** A board cell: empty, a locked piece colour, or garbage. */
export type Cell = PieceType | 'G' | null;
export type Board = Cell[][];

export type Matrix = number[][];

/** A piece's shape in spawn orientation; its type is also its colour. */
export interface PieceShape {
  type: PieceType;
  matrix: Matrix;
}

export interface ActivePiece {
  /** The colour, the same as `shape.type`. */
  type: PieceType;
  /** What it spawned as (or was changed to), unrotated: what hold stores. */
  shape: PieceShape;
  /** The shape as currently rotated. */
  matrix: Matrix;
  x: number;
  y: number;
}

/** What the board renderer needs: the cells, the falling piece and where it would land. */
export interface BoardView {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly ghostY: number | null;
  /** Curses in effect, in settlement order; the painter marks the piece for some of them. */
  readonly activeCurses?: readonly EffectType[];
  /** Play time so far, for animations drawn on the canvas. */
  readonly timeMs?: number;
}

export interface TeamState {
  /** Triggered curses waiting to fire, per type. */
  pending: Record<EffectType, number>;
  giftCount: number;
  hitCount: number;
  missCount: number;
  /** Curses that have fired at a settlement. */
  firedCount: number;
  /** Per settlement queue, the type that fired last, so a shared queue takes turns. */
  lastFired: Partial<Record<string, EffectType>>;
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

export interface GiftBatchInput {
  sender: string;
  /** Positive integer, 1..maxBatch. */
  count: number;
}
