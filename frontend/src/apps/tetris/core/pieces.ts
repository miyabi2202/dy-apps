import { CONFIG } from './config';
import { shuffle, type Rng } from './random';
import type { ActivePiece, Matrix, PieceShape, PieceType } from './types';

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_MATRICES: Record<PieceType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

/**
 * Simplified kick table (not SRS): offsets tried in order after rotating.
 * Negative y moves the piece up.
 */
export const KICK_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
  [0, -2],
];

/** Rotate a square matrix 90 degrees: 1 = clockwise, -1 = counter-clockwise. */
export function rotateMatrix(m: Matrix, dir: 1 | -1): Matrix {
  const n = m.length;
  const out: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (dir === 1) out[c]![n - 1 - r] = m[r]![c]!;
      else out[n - 1 - c]![r] = m[r]![c]!;
    }
  }
  return out;
}

const PIECE_SHAPES = Object.fromEntries(
  PIECE_TYPES.map((type) => [type, { type, matrix: PIECE_MATRICES[type] }]),
) as Record<PieceType, PieceShape>;

/** A standard piece's shape. The same object every time, so it is safe to compare. */
export function shapeOf(type: PieceType): PieceShape {
  return PIECE_SHAPES[type];
}

/** A piece of `shape` at the top, centred by width. */
export function createPiece(shape: PieceShape): ActivePiece {
  const matrix = shape.matrix.map((row) => [...row]);
  const width = matrix[0]!.length;
  return { type: shape.type, shape, matrix, x: Math.floor((CONFIG.board.cols - width) / 2), y: 0 };
}

/** Absolute [x, y] of every filled cell. */
export function pieceCells(matrix: Matrix, x: number, y: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r]!;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]) cells.push([x + c, y + r]);
    }
  }
  return cells;
}

/** 7-bag generator: each bag holds all seven pieces once, shuffled with Fisher–Yates. */
export class BagGenerator {
  private bag: PieceType[] = [];

  constructor(private readonly rng: Rng) {}

  next(): PieceType {
    if (this.bag.length === 0) {
      this.bag = shuffle([...PIECE_TYPES], this.rng);
    }
    return this.bag.shift()!;
  }
}
