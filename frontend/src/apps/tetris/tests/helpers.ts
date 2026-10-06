import { createBoard } from '../core/board';
import { EFFECT_POOL, type EffectType } from '../core/curses';
import { GameEngine, type EngineOptions } from '../core/game';
import { createPiece, shapeOf } from '../core/pieces';
import { constantRng, sequenceRng, type Rng } from '../core/random';
import type { Board, PieceType } from '../core/types';

/** Gift RNG draws that always hit and always pick `type`. */
export function forceEffectRng(type: EffectType): Rng {
  const index = EFFECT_POOL.indexOf(type);
  return sequenceRng([0, (index + 0.5) / EFFECT_POOL.length]);
}

/** Pending counts for every curse: the ones given, zero for the rest. */
export function pendingOf(counts: Partial<Record<EffectType, number>>): Record<EffectType, number> {
  return Object.fromEntries(EFFECT_POOL.map((type) => [type, counts[type] ?? 0])) as Record<
    EffectType,
    number
  >;
}

/** Engine with a fixed piece sequence (O pieces by default) and a started game. */
export function startedEngine(options: EngineOptions = {}): GameEngine {
  const engine = new GameEngine({ seed: 1, giftRng: constantRng(0.99), ...options });
  engine.start();
  return engine;
}

export function setActive(engine: GameEngine, type: PieceType): void {
  engine.active = createPiece(shapeOf(type));
}

/** Board whose rows (by index from the top) are filled except for `holes` columns. */
export function boardWithRows(rows: number[], holes: number[]): Board {
  const board = createBoard();
  for (const r of rows) {
    board[r] = board[r]!.map((_, c) => (holes.includes(c) ? null : 'G'));
  }
  return board;
}

/** Hard-drop pieces on a cleared board so nothing tops out. */
export function dropOnEmpty(engine: GameEngine, times: number): void {
  for (let i = 0; i < times; i += 1) {
    engine.board = createBoard();
    if (engine.active) engine.active = createPiece(engine.active.shape);
    engine.hardDrop();
  }
}
