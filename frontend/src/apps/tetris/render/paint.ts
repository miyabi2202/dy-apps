import { CONFIG } from '../core/config';
import type { EffectType } from '../core/curses';
import { pieceCells } from '../core/pieces';
import type { ActivePiece, BoardView, Cell, Matrix, PieceShape, PieceType } from '../core/types';
import { PIECE_TINTS, type PieceTint } from './curse-styles';
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
    const tint = tintFor(view.activeCurses ?? []);
    const color = tint?.color ?? PIECE_COLORS[piece.type];
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, ghostY)) {
      if (y >= 0) ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }
    ctx.globalAlpha = 1;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, piece.y)) {
      if (y >= 0) paintCell(ctx, x, y, size, color);
    }
    if (tint) paintTintMark(ctx, piece, size, tint, view.timeMs ?? 0);
  }
}

/** The first active curse that changes how the piece is drawn, if any. */
function tintFor(active: readonly EffectType[]): PieceTint | undefined {
  for (const type of active) {
    const tint = PIECE_TINTS[type];
    if (tint) return tint;
  }
  return undefined;
}

/**
 * Marks a cursed piece so the player knows it is the curse: a pulsing veil over its cells,
 * then either a dashed outline marching around it or static hatching across it.
 */
function paintTintMark(
  ctx: Canvas2D,
  piece: ActivePiece,
  size: number,
  tint: PieceTint,
  timeMs: number,
): void {
  const cells = pieceCells(piece.matrix, piece.x, piece.y).filter(([, y]) => y >= 0);
  if (cells.length === 0) return;
  ctx.save();

  // A slow pulse between the tint and the dark board, so the piece visibly throbs.
  ctx.fillStyle = BG;
  ctx.globalAlpha = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(timeMs / 160));
  for (const [x, y] of cells) ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = tint.color;
  if (tint.mark === 'marching') {
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const left = Math.min(...xs) * size - 3;
    const top = Math.min(...ys) * size - 3;
    const right = (Math.max(...xs) + 1) * size + 3;
    const bottom = (Math.max(...ys) + 1) * size + 3;
    ctx.lineWidth = 2;
    ctx.setLineDash([size * 0.4, size * 0.25]);
    ctx.lineDashOffset = -(timeMs / 25) % (size * 0.65);
    ctx.strokeRect(left, top, right - left, bottom - top);
  } else {
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (const [x, y] of cells) {
      const x0 = x * size + 1;
      const y0 = y * size + 1;
      const s = size - 2;
      ctx.moveTo(x0, y0 + s);
      ctx.lineTo(x0 + s, y0);
      ctx.moveTo(x0, y0 + s / 2);
      ctx.lineTo(x0 + s / 2, y0);
      ctx.moveTo(x0 + s / 2, y0 + s);
      ctx.lineTo(x0 + s, y0 + s / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
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
