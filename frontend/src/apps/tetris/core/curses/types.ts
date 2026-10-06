import type { CONFIG } from '../config';
import type { Rng } from '../random';
import type { ActivePiece, Board, PieceShape } from '../types';
import type { EffectType } from './index';

/** Player commands a curse can block while it is active. */
export type Command = 'rotate' | 'hold';

/** A curse's answer at settlement: a reason ends the game, nothing means play on. */
export interface CurseOutcome {
  gameOver?: string;
}

/**
 * Everything one curse is: its name and rules text, how long it lasts, and the hooks the
 * engine calls. `S` is the state it keeps while active.
 */
export interface CurseDef<S = undefined, T extends string = EffectType> {
  /** Its key in the registry. */
  type: T;
  name: string;
  /** Rules text; gets CONFIG so numbers are never typed twice. */
  description(config: typeof CONFIG): string;
  /** How many locks it stays active; omitted means it fires once in apply and is done. */
  durationLocks?: number;
  /** Fresh state when the curse becomes active. */
  initState?(): S;
  /** At settlement, every time it fires. */
  apply?(ctx: CurseContext, state: S): CurseOutcome | void;
  /** While active. */
  blocks?: readonly Command[];
  hidesPreview?: boolean;
  /** Every frame of play while active, before gravity. Not while paused. */
  onTick?(ctx: CurseContext, dtMs: number, state: S): void;
  /** Only for pieces fresh from the queue, never for a hold swap. Returns the piece to spawn. */
  onSpawn?(ctx: CurseContext, piece: ActivePiece, state: S): ActivePiece;
}

/**
 * Keeps S inferred inside the file and erases it for the registry. The literal `type` is kept,
 * so the registry's keys (and EffectType) don't depend on EffectType itself.
 */
export function defineCurse<S = undefined, T extends string = string>(
  def: CurseDef<S, T>,
): CurseDef<unknown, T> {
  // Hooks are methods, so TypeScript checks their state parameter bivariantly: the engine
  // only ever hands a curse the state its own initState made.
  return def;
}

/** What the engine lets a curse see and do. Never the engine itself. */
export interface CurseContext {
  readonly board: Board;
  readonly active: ActivePiece | null;
  /** The curses' own seeded stream, separate from pieces, garbage and gifts. */
  readonly curseRng: Rng;
  readonly garbageRng: Rng;
  /**
   * Rotate the active piece with the kick table, if any kick fits. Ignores rotation blocks;
   * neither resets the lock timer nor spends a lock reset.
   */
  tryRotate(dir: 1 | -1): boolean;
  /**
   * Give the active piece `shape` (unrotated) at its current position, if it fits. False leaves
   * the piece unchanged. Neither resets the lock timer nor spends a lock reset.
   */
  trySetShape(shape: PieceShape): boolean;
  /** Haste keeps its accumulator here. */
  multiplyGravity(factor: number): void;
}
