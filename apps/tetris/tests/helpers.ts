import { createBoard } from '../src/core/board';
import { EFFECT_POOL } from '../src/core/config';
import { GameEngine, type EngineOptions } from '../src/core/game';
import { createPiece } from '../src/core/pieces';
import { constantRng, sequenceRng, type Rng } from '../src/core/random';
import type { Board, EffectType, PieceType } from '../src/core/types';

/** Gift RNG draws that always hit and always pick `type`. */
export function forceEffectRng(type: EffectType): Rng {
  const index = EFFECT_POOL.indexOf(type);
  return sequenceRng([0, (index + 0.5) / EFFECT_POOL.length]);
}

/** Engine with a fixed piece sequence (O pieces by default) and a started game. */
export function startedEngine(options: EngineOptions = {}): GameEngine {
  const engine = new GameEngine({ seed: 1, giftRng: constantRng(0.99), ...options });
  engine.start();
  return engine;
}

export function setActive(engine: GameEngine, type: PieceType): void {
  engine.active = createPiece(type);
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
    if (engine.active) engine.active = createPiece(engine.active.type);
    engine.hardDrop();
  }
}
