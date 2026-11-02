import { CONFIG } from '../core/config';
import type { EffectType } from '../core/curses';
import { createPiece, pieceCells, shapeOf } from '../core/pieces';
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
const FLASH = '#ffffff';

/** 落石: how long a stone takes to fall, then how long its landing puff shows. */
const DROP_MS = 380;
const PUFF_MS = 260;
/** 调包: how long the promised piece shows before the swap, then how long the swap flashes. */
const SWAP_SHOW_MS = 220;
const SWAP_FLASH_MS = 280;
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

  const timeMs = view.timeMs ?? 0;
  const dropAge = view.drops ? timeMs - view.drops.atMs : Infinity;
  const falling = new Set(dropAge < DROP_MS ? view.drops!.cells.map(([x, y]) => `${x},${y}`) : []);
  view.board.forEach((row, y) =>
    row.forEach((cell: Cell, x) => {
      if (cell && !falling.has(`${x},${y}`)) paintCell(ctx, x, y, size, PIECE_COLORS[cell]);
    }),
  );
  if (view.drops) paintDrops(ctx, view.board, view.drops.cells, dropAge, size);

  const { active: piece, ghostY } = view;
  const swapAge = view.swap ? timeMs - view.swap.atMs : Infinity;
  if (piece && view.swap && swapAge < SWAP_SHOW_MS) {
    // Still the piece the preview promised, about to be swapped.
    const promised = createPiece(shapeOf(view.swap.from));
    for (const [x, y] of pieceCells(promised.matrix, promised.x, piece.y)) {
      if (y >= 0) paintCell(ctx, x, y, size, PIECE_COLORS[view.swap.from]);
    }
  } else if (piece && ghostY !== null) {
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
    if (tint) paintTintMark(ctx, piece, size, tint, timeMs);
    if (swapAge < SWAP_SHOW_MS + SWAP_FLASH_MS) {
      paintSwapFlash(ctx, piece, size, (swapAge - SWAP_SHOW_MS) / SWAP_FLASH_MS);
    }
  }
}

/** Stones falling from above the board to their cells, then a puff where each lands. */
function paintDrops(
  ctx: Canvas2D,
  board: BoardView['board'],
  cells: readonly [number, number][],
  ageMs: number,
  size: number,
): void {
  ctx.save();
  for (const [x, y] of cells) {
    const color = PIECE_COLORS[board[y]?.[x] ?? 'G'];
    if (ageMs < DROP_MS) {
      const t = ageMs / DROP_MS;
      // Accelerating from one cell above the top, like something dropped.
      const fy = -1 + (y + 1) * t * t;
      paintCell(ctx, x, fy, size, color);
    } else if (ageMs < DROP_MS + PUFF_MS) {
      const k = (ageMs - DROP_MS) / PUFF_MS;
      const grow = size * 0.6 * k;
      ctx.strokeStyle = FLASH;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8 * (1 - k);
      ctx.strokeRect(x * size - grow, y * size - grow / 2, size + grow * 2, size + grow);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** The swapped-in piece flashing white and fading to its colour, with streaks behind it. */
function paintSwapFlash(ctx: Canvas2D, piece: ActivePiece, size: number, k: number): void {
  const cells = pieceCells(piece.matrix, piece.x, piece.y).filter(([, y]) => y >= 0);
  ctx.save();
  ctx.fillStyle = FLASH;
  ctx.globalAlpha = 0.85 * (1 - k);
  for (const [x, y] of cells) ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // Speed lines trailing off the left of each row, as if it was swiped in.
  ctx.globalAlpha = 0.6 * (1 - k);
  const rows = new Map<number, number>();
  for (const [x, y] of cells) rows.set(y, Math.min(rows.get(y) ?? x, x));
  for (const [y, left] of rows) {
    const length = size * (1.5 + 1.5 * k);
    ctx.fillRect(left * size - length, y * size + size * 0.35, length, Math.max(1, size * 0.12));
    ctx.fillRect(
      left * size - length * 0.6,
      y * size + size * 0.65,
      length * 0.6,
      Math.max(1, size * 0.08),
    );
  }
  ctx.restore();
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
  if (tint.mark === 'flare') {
    // A fast flicker around each cell: it could lock any moment.
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(timeMs / 55);
    for (const [x, y] of cells) ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  } else if (tint.mark === 'marching') {
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
