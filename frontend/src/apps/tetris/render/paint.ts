import { CONFIG } from '../core/config';
import { pieceCells } from '../core/pieces';
import type { BoardView, Cell, Matrix, PieceShape, PieceType } from '../core/types';
import type { Canvas2D } from './canvas';

const { cols, rows } = CONFIG.board;

export const PIECE_COLORS: Record<PieceType | 'G', string> = {
  I: '#38bdf8',
  O: '#facc15',
  T: '#c084fc',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
  G: '#64748b',
};

const BG = '#0b1120';
const GRID = 'rgba(148, 163, 184, 0.10)';
const HIGHLIGHT = 'rgba(255,255,255,0.18)';

function paintCell(ctx: Canvas2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  ctx.fillStyle = HIGHLIGHT;
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(2, size * 0.12));
}

/** The board, its locked cells, the ghost and the active piece, in a `w` × `h` area. */
export function paintBoard(ctx: Canvas2D, view: BoardView, w: number, h: number): void {
  const size = Math.min(w / cols, h / rows);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let c = 1; c < cols; c += 1) {
    ctx.beginPath();
    ctx.moveTo(c * size + 0.5, 0);
    ctx.lineTo(c * size + 0.5, rows * size);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r += 1) {
    ctx.beginPath();
    ctx.moveTo(0, r * size + 0.5);
    ctx.lineTo(cols * size, r * size + 0.5);
    ctx.stroke();
  }

  view.board.forEach((row, y) =>
    row.forEach((cell: Cell, x) => {
      if (cell) paintCell(ctx, x, y, size, PIECE_COLORS[cell]);
    }),
  );

  const { active: piece, ghostY } = view;
  if (piece && ghostY !== null) {
    ctx.strokeStyle = PIECE_COLORS[piece.type];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, ghostY)) {
      if (y >= 0) ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }
    ctx.globalAlpha = 1;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, piece.y)) {
      if (y >= 0) paintCell(ctx, x, y, size, PIECE_COLORS[piece.type]);
    }
  }
}

/** Trim empty rows/columns so small previews are centred. */
function trim(matrix: Matrix): Matrix {
  const rowsUsed = matrix.filter((row) => row.some(Boolean));
  const colsUsed = rowsUsed[0]!.map((_, c) => rowsUsed.some((row) => row[c]));
  return rowsUsed.map((row) => row.filter((_, c) => colsUsed[c]));
}

/** One piece, centred in a `w` × `h` area; nothing for an empty slot. */
export function paintMiniPiece(
  ctx: Canvas2D,
  shape: PieceShape | null,
  dim: boolean,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  if (!shape) return;
  const color = PIECE_COLORS[shape.type];
  const m = trim(shape.matrix);
  const size = Math.min(w / 4.5, h / 2.5);
  const ox = (w - m[0]!.length * size) / 2;
  const oy = (h - m.length * size) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.globalAlpha = dim ? 0.35 : 1;
  m.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) paintCell(ctx, x, y, size, color);
    }),
  );
  ctx.restore();
}
