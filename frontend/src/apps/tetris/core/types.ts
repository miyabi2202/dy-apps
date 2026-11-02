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
  /** The second falling piece while a curse spawns pairs (双落), and where it would land. */
  readonly twin?: ActivePiece | null;
  readonly twinGhostY?: number | null;
  /** Curses in effect, in settlement order; the painter marks the piece for some of them. */
  readonly activeCurses?: readonly EffectType[];
  /** Play time so far, for animations drawn on the canvas. */
  readonly timeMs?: number;
  /**
   * Pieces that spawned as something else than the preview promised (调包), at `atMs` of play
   * time: the active piece was promised as `from`, the twin as `twinFrom`; unset if not swapped.
   */
  readonly swap?: SwapView | null;
  /** Board cells that dropped into place (落石) at `atMs` of play time. */
  readonly drops?: { readonly cells: readonly [number, number][]; readonly atMs: number } | null;
}

export interface SwapView {
  readonly from?: PieceType;
  readonly twinFrom?: PieceType;
  readonly atMs: number;
}

export interface TeamState {
  /** Triggered curses waiting to fire, per type. */
  pending: Record<EffectType, number>;
  giftCount: number;
  hitCount: number;
  missCount: number;
  /** Curses that have fired at a settlement. */
  firedCount: number;
  /** Curses the game drew itself because the room was quiet. */
  systemCount: number;
  /** Curses added by hand from the debug panel. */
  debugCount: number;
  /** Pending curses the player cancelled by clearing lines. */
  cancelledCount: number;
  /** Per settlement queue, the type that fired last, so a shared queue takes turns. */
  lastFired: Partial<Record<string, EffectType>>;
  /**
   * Who sent each pending curse, per type, oldest first; the engine takes the first as one fires
   * or is cancelled. Can be shorter than `pending` (a test that sets counts directly).
   */
  senders: Partial<Record<EffectType, Sender[]>>;
}

/** Who a curse came from, for its animations: a viewer, or the game itself. */
export interface Sender {
  id: string;
  name: string;
  avatarUrl?: string;
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
