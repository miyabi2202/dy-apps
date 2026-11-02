import type { CONFIG } from '../config';
import type { Rng } from '../random';
import type { ActivePiece, Board, PieceShape, PieceType } from '../types';
import type { EffectType } from './index';

/** Player commands a curse can block while it is active. */
export type Command = 'move' | 'rotate' | 'hold' | 'softDrop' | 'hardDrop';

/** How often a curse should come up, from most to least. */
export type Rarity = 'common' | 'uncommon' | 'rare';

/** The rarities from most to least common: the order of the weights and of the draw's bands. */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare'];

/** A curse's answer at settlement: a reason ends the game, nothing means play on. */
export interface CurseOutcome {
  gameOver?: string;
  /** Board cells [x, y] that just dropped into place, so the board can animate their fall. */
  dropped?: [number, number][];
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
  /** How often it comes up: gifts draw by its weight (gifts.ts). */
  rarity: Rarity;
  /**
   * The settlement queue it belongs to. Each settlement fires at most one pending curse per
   * queue, taking turns (the next in pool order after the one that fired last); the rest of that
   * queue waits. A curse in a queue of its own never has to wait for others.
   */
  queue: string;
  /**
   * How many settlement rounds one firing lasts (a round is CONFIG.settlement.everyLocks locks).
   * Every firing is its own instance, and instances overlap. Omitted means it fires once in
   * apply and is done.
   */
  durationRounds?: number;
  /** Or how many locked pieces one firing lasts, for curses shorter than a round. */
  durationLocks?: number;
  /** While active: the drop interval is multiplied by this once per active instance. */
  gravityMultiplier?: number;
  /** While active: the lock delay is multiplied by this once per active instance; 0 locks on touch. */
  lockDelayMultiplier?: number;
  /** While active: the player's left and right moves are swapped. */
  mirrorsMoves?: boolean;
  /**
   * While active: every player command (move, rotate, drop, hold) acts this many ms of play time
   * later than pressed, in order. Ones still waiting when the piece locks act on the next.
   */
  inputDelayMs?: number;
  /** While active: the board itself moves, so the room sees it at a glance. */
  boardEffect?: 'sway';
  /**
   * While active: each fresh piece spawns with the next one from the queue beside it. They move
   * and fall together; one that lands locks and the other plays on. The pair counts as one lock.
   */
  spawnsTwin?: boolean;
  /**
   * Changes how the next piece behaves, with no mark on the piece: firing it holds the game for a
   * cutscene (its name, then a countdown) before that piece spawns. So it should last 1 piece.
   */
  cutscene?: boolean;
  /** A playful line under the name in its cutscene, like 冻住不许转. */
  tagline?: string;
  /** How long its cutscene shows the name, instead of CONFIG.cutscene.introMs. */
  cutsceneMs?: number;
  /**
   * While active: viewers steer the piece by typing CONFIG.viewerCommands in chat, each one
   * acting at once. Block the player's commands as well to hand the piece over completely.
   */
  viewerControl?: boolean;
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
  /** Each player move left (-1) or right (1), after any mirroring: returns the step to take. */
  onMove?(ctx: CurseContext, dx: -1 | 1, state: S): -1 | 1;
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
  /** The pieces still to come, next first; the preview shows the first few. */
  readonly upcoming: readonly PieceType[];
  /** The curses' own seeded stream, separate from pieces, garbage and gifts. */
  readonly curseRng: Rng;
  readonly garbageRng: Rng;
  /**
   * Rotate the active piece with the kick table, if any kick fits. Ignores rotation blocks;
   * neither resets the lock timer nor spends a lock reset.
   */
  tryRotate(dir: 1 | -1): boolean;
  /**
   * Move the active piece one column, if it fits. Ignores mirroring; neither resets the lock
   * timer nor spends a lock reset.
   */
  tryMove(dx: 1 | -1): boolean;
  /**
   * Give the active piece `shape` (unrotated) at its current position, if it fits. False leaves
   * the piece unchanged. Neither resets the lock timer nor spends a lock reset.
   */
  trySetShape(shape: PieceShape): boolean;
  /** Replace the upcoming piece at `index` (0 is next). False if there is none there. */
  setUpcoming(index: number, type: PieceType): boolean;
}
