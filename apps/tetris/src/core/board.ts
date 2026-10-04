import { CONFIG } from './config';
import { pieceCells } from './pieces';
import { randomInt, type Rng } from './random';
import type { Board, Cell, Matrix } from './types';

const { cols, rows } = CONFIG.board;

export function emptyRow(): Cell[] {
  return new Array<Cell>(cols).fill(null);
}

export function createBoard(): Board {
  return Array.from({ length: rows }, emptyRow);
}

/** Cells above the visible top (y < 0) never collide; walls and floor do. */
export function collides(board: Board, matrix: Matrix, x: number, y: number): boolean {
  for (const [cx, cy] of pieceCells(matrix, x, y)) {
    if (cx < 0 || cx >= cols || cy >= rows) return true;
    if (cy >= 0 && board[cy]![cx] !== null) return true;
  }
  return false;
}

/** Remove complete rows, add empty rows on top. Returns the number cleared. */
export function clearFullLines(board: Board): number {
  let cleared = 0;
  for (let r = rows - 1; r >= 0; r -= 1) {
    if (board[r]!.every((cell) => cell !== null)) {
      board.splice(r, 1);
      cleared += 1;
    }
  }
  for (let i = 0; i < cleared; i += 1) board.unshift(emptyRow());
  return cleared;
}

/**
 * Push `n` garbage rows in from the bottom, each with one random hole.
 * Returns true if a non-empty row was pushed off the top (game over).
 */
export function addGarbageRows(board: Board, n: number, rng: Rng): boolean {
  for (let i = 0; i < n; i += 1) {
    const top = board.shift()!;
    const hole = randomInt(rng, cols);
    const row = new Array<Cell>(cols).fill('G');
    row[hole] = null;
    board.push(row);
    if (top.some((cell) => cell !== null)) return true;
  }
  return false;
}
