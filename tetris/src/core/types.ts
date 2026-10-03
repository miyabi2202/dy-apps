export type EffectType = 'garbage' | 'haste' | 'fog' | 'seal';
export type Phase = 'ready' | 'playing' | 'paused' | 'gameOver';
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Level = 1 | 2 | 3;

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

export interface EffectNode {
  id: number;
  type: EffectType;
  /** 1..nodeMaxEnergy */
  energy: number;
  waitedSettlements: number;
  promoted: boolean;
  /** Only meaningful for garbage. */
  canceledLines: number;
}

export interface ReserveEntry {
  energy: number;
  firstQueuedOrder: number;
}

export type Reserve = Partial<Record<EffectType, ReserveEntry>>;

export interface TeamState {
  /** Length <= queue capacity; index 0 is implicitly locked. */
  queue: EffectNode[];
  reserve: Reserve;
  giftCount: number;
  hitCount: number;
  missCount: number;
  overflowEnergy: number;
  spentEnergy: number;
}

export interface GiftBatchResult {
  count: number;
  triggerProbability: number;
  hits: number;
  misses: number;
  effects: Partial<Record<EffectType, number>>;
  /** Energy that was queued as a new node or merged into one. */
  queuedEnergy: number;
  /** Energy that went straight into the reserve. */
  reservedEnergy: number;
  overflowEnergy: number;
  promotions: number;
  /** Effects that moved forward in this batch, in order. Bounded by queue capacity. */
  promotedEffects: EffectType[];
}

export interface TimedPieceEffect {
  remainingLocks: number;
  level: Level;
}

/** Monotonic id sources for the team's nodes and reserve. */
export interface IdSource {
  nextNodeId(): number;
  nextReserveOrder(): number;
}

export interface GiftBatchInput {
  /** Positive integer, 1..maxBatch. */
  count: number;
}
