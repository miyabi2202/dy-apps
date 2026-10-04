import { CONFIG } from '../core/config';
import type { GameEngine } from '../core/game';
import { pieceCells, PIECE_MATRICES } from '../core/pieces';
import type { Cell, Matrix, PieceType } from '../core/types';

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

/** Size the backing store to CSS size × devicePixelRatio; returns the logical size. */
function prepare(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, Math.max(2, size * 0.12));
}

export function drawBoard(canvas: HTMLCanvasElement, engine: GameEngine): void {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
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

  engine.board.forEach((row, y) =>
    row.forEach((cell: Cell, x) => {
      if (cell) drawCell(ctx, x, y, size, PIECE_COLORS[cell]);
    }),
  );

  const piece = engine.active;
  const ghostY = engine.ghostY;
  if (piece && ghostY !== null) {
    ctx.strokeStyle = PIECE_COLORS[piece.type];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, ghostY)) {
      if (y >= 0) ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }
    ctx.globalAlpha = 1;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, piece.y)) {
      if (y >= 0) drawCell(ctx, x, y, size, PIECE_COLORS[piece.type]);
    }
  }
}

/** Trim empty rows/columns so small previews are centred. */
function trim(matrix: Matrix): Matrix {
  const rowsUsed = matrix.filter((row) => row.some(Boolean));
  const colsUsed = rowsUsed[0]!.map((_, c) => rowsUsed.some((row) => row[c]));
  return rowsUsed.map((row) => row.filter((_, c) => colsUsed[c]));
}

export function drawMiniPiece(
  canvas: HTMLCanvasElement,
  type: PieceType | null,
  dim = false,
): void {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  ctx.clearRect(0, 0, w, h);
  if (!type) return;
  const m = trim(PIECE_MATRICES[type]);
  const size = Math.min(w / 4.5, h / 2.5);
  const ox = (w - m[0]!.length * size) / 2;
  const oy = (h - m.length * size) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.globalAlpha = dim ? 0.35 : 1;
  m.forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) drawCell(ctx, x, y, size, PIECE_COLORS[type]);
    }),
  );
  ctx.restore();
}
