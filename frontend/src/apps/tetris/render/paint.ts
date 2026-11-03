import { CONFIG } from '../core/config';
import type { EffectType } from '../core/curses';
import { createPiece, pieceCells, shapeOf } from '../core/pieces';
import type {
  ActivePiece,
  BoardView,
  CalloutView,
  Cell,
  DangerView,
  Matrix,
  NudgeView,
  PieceShape,
  PieceType,
} from '../core/types';
import { NUDGE_ICONS, PIECE_TINTS, type PieceTint } from './curse-styles';
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
const LABEL = '#f1f5f9';

/** 落石: how long a stone takes to fall, then how long its landing puff shows. */
const DROP_MS = 380;
const PUFF_MS = 260;
/** 调包: how long the promised piece shows before the swap, then how long the swap flashes. */
const SWAP_SHOW_MS = 220;
const SWAP_FLASH_MS = 280;
/** 醉酒/打滑 moving the piece by itself: how long its afterimage and speed lines last, then its sign. */
const NUDGE_MS = 450;
const NUDGE_ICON_MS = 900;
/** 摸鱼's spreadsheet: the sheet, its grid and headers, filled cells and the selected piece. */
const SHEET = {
  bg: '#ffffff',
  grid: '#d4d4d4',
  header: '#f3f3f3',
  headerText: '#6b7280',
  cell: '#f1f5f9',
  text: '#1f2937',
  select: '#217346',
  selectFill: 'rgba(33, 115, 70, 0.16)',
};
/** Danger: the red glow's colour, and how long it flares after each heartbeat. */
const DANGER = '#ef4444';
const BEAT_MS = 450;
/** A big clear or combo: how long its callout shows, and how long it takes to pop in. */
const CALLOUT_MS = 1200;
const CALLOUT_POP_MS = 140;
const CALLOUT_LINES: Record<number, { text: string; color: string }> = {
  2: { text: 'DOUBLE', color: '#38bdf8' },
  3: { text: 'TRIPLE', color: '#c084fc' },
  4: { text: 'TETRIS!', color: '#facc15' },
};
const COMBO_COLOR = '#f472b6';
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
  const timeMs = view.timeMs ?? 0;
  if (view.excel) {
    paintSheet(ctx, view, w, h, size);
    if (view.callout) paintCallout(ctx, view.callout, timeMs - view.callout.atMs, size);
    return;
  }

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

  const dropAge = view.drops ? timeMs - view.drops.atMs : Infinity;
  const falling = new Set(dropAge < DROP_MS ? view.drops!.cells.map(([x, y]) => `${x},${y}`) : []);
  view.board.forEach((row, y) =>
    row.forEach((cell: Cell, x) => {
      if (cell && !falling.has(`${x},${y}`)) paintCell(ctx, x, y, size, PIECE_COLORS[cell]);
    }),
  );
  if (view.drops) paintDrops(ctx, view.board, view.drops.cells, dropAge, size);
  if (view.rowLabels) paintRowLabels(ctx, view.board, view.rowLabels, size);

  const { active: piece, ghostY } = view;
  const tint = tintFor(view.activeCurses ?? []);
  const swapAge = view.swap ? timeMs - view.swap.atMs : Infinity;
  if (piece) {
    paintSwappable(ctx, piece, ghostY, view.swap?.from, swapAge, size, tint, timeMs);
  }
  if (piece && view.nudge) paintNudge(ctx, piece, view.nudge, timeMs - view.nudge.atMs, size);
  if (view.twin && view.twinGhostY != null) {
    paintSwappable(
      ctx,
      view.twin,
      view.twinGhostY,
      view.swap?.twinFrom,
      swapAge,
      size,
      tint,
      timeMs,
    );
  }
  if (view.danger) paintDanger(ctx, view.danger, timeMs, size);
  if (view.callout) paintCallout(ctx, view.callout, timeMs - view.callout.atMs, size);
}

/**
 * Danger: a red glow inside the board's edges, flaring with each heartbeat and stronger the
 * nearer the stack is to the top.
 */
function paintDanger(ctx: Canvas2D, danger: DangerView, timeMs: number, size: number): void {
  const beat = Math.max(0, 1 - (timeMs - danger.beatAtMs) / BEAT_MS);
  const strength = (0.35 + 0.65 * danger.level) * (0.45 + 0.55 * beat);
  const w = cols * size;
  const h = rows * size;
  const band = size * 0.3;
  ctx.save();
  ctx.strokeStyle = DANGER;
  ctx.lineWidth = band;
  for (let i = 0; i < 4; i += 1) {
    ctx.globalAlpha = strength * (0.8 - i * 0.2);
    const inset = band * (i + 0.5);
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  }
  ctx.restore();
}

/**
 * A big clear or combo shouted over the board where the lines went: DOUBLE, TRIPLE or TETRIS!,
 * and COMBO ×n under it. It pops in big, holds, then rises and fades.
 */
function paintCallout(ctx: Canvas2D, callout: CalloutView, ageMs: number, size: number): void {
  if (ageMs < 0 || ageMs >= CALLOUT_MS) return;
  const k = ageMs / CALLOUT_MS;
  const pop = ageMs < CALLOUT_POP_MS ? 1.6 - 0.6 * (ageMs / CALLOUT_POP_MS) : 1;
  const lines = CALLOUT_LINES[Math.min(callout.lines, 4)];
  const shouts = [
    ...(lines ? [{ ...lines, scale: 1.7 }] : []),
    ...(callout.combo ? [{ text: `COMBO ×${callout.combo}`, color: COMBO_COLOR, scale: 1.1 }] : []),
  ];
  const w = cols * size;
  ctx.save();
  ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BG;
  // Each shout's font size, shrunk to fit the board's width.
  const sized = shouts.map((shout) => {
    let px = Math.round(size * shout.scale * pop);
    ctx.font = `900 ${px}px system-ui, sans-serif`;
    const width = ctx.measureText(shout.text).width;
    if (width > w - 8) px = Math.floor((px * (w - 8)) / width);
    return { ...shout, px };
  });
  // Centred on the cleared rows, but kept whole on the board.
  const total = sized.reduce((sum, { px }) => sum + px * 1.05, 0);
  const rise = k > 0.7 ? ((k - 0.7) / 0.3) * size : 0;
  const centre = (callout.row + 0.5) * size;
  let top = Math.min(rows * size - total - size * 0.3, Math.max(size * 0.5, centre - total / 2));
  top -= rise;
  for (const { text, color, px } of sized) {
    ctx.font = `900 ${px}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, px * 0.18);
    ctx.fillStyle = color;
    const y = top + (px * 1.05) / 2;
    ctx.strokeText(text, w / 2, y);
    ctx.fillText(text, w / 2, y);
    top += px * 1.05;
  }
  ctx.restore();
}

/**
 * A falling piece that 调包 may have swapped at spawn: for a moment still the piece the preview
 * promised (`from`), then the real one flashing in.
 */
function paintSwappable(
  ctx: Canvas2D,
  piece: ActivePiece,
  ghostY: number | null,
  from: PieceType | undefined,
  swapAge: number,
  size: number,
  tint: PieceTint | undefined,
  timeMs: number,
): void {
  if (from && swapAge < SWAP_SHOW_MS) {
    const promised = createPiece(shapeOf(from));
    for (const [x, y] of pieceCells(promised.matrix, piece.x, piece.y)) {
      if (y >= 0) paintCell(ctx, x, y, size, PIECE_COLORS[from]);
    }
    return;
  }
  paintFalling(ctx, piece, ghostY, size, tint, timeMs);
  if (from && swapAge < SWAP_SHOW_MS + SWAP_FLASH_MS) {
    paintSwapFlash(ctx, piece, size, (swapAge - SWAP_SHOW_MS) / SWAP_FLASH_MS);
  }
}

/**
 * A falling piece: its ghost where it would land (none while something else moves it, 热心), then
 * the piece, marked if a curse tints it.
 */
function paintFalling(
  ctx: Canvas2D,
  piece: ActivePiece,
  ghostY: number | null,
  size: number,
  tint: PieceTint | undefined,
  timeMs: number,
): void {
  const color = tint?.color ?? PIECE_COLORS[piece.type];
  if (ghostY !== null) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, ghostY)) {
      if (y >= 0) ctx.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }
    ctx.globalAlpha = 1;
  }
  for (const [x, y] of pieceCells(piece.matrix, piece.x, piece.y)) {
    if (y >= 0) paintCell(ctx, x, y, size, color);
  }
  if (tint) paintTintMark(ctx, piece, size, tint, timeMs);
}

/**
 * The names printed on rows (垃圾行), each centred on the row's longest run of filled cells so the
 * hole stays clear, and cut short with … if it doesn't fit.
 */
function paintRowLabels(
  ctx: Canvas2D,
  board: BoardView['board'],
  labels: readonly (string | null)[],
  size: number,
): void {
  ctx.save();
  ctx.font = `bold ${Math.round(size * 0.75)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = LABEL;
  labels.forEach((label, y) => {
    if (!label) return;
    const [from, to] = longestRun(board[y] ?? []);
    if (to === from) return;
    const text = fitText(ctx, label, (to - from) * size - 4);
    if (text) ctx.fillText(text, ((from + to) / 2) * size, (y + 0.5) * size + 0.5);
  });
  ctx.restore();
}

/** The longest run of filled cells in a row, as [first column, column after the last]. */
function longestRun(row: readonly Cell[]): [number, number] {
  let best: [number, number] = [0, 0];
  let start = 0;
  for (let x = 0; x <= row.length; x += 1) {
    if (x < row.length && row[x]) continue;
    if (x - start > best[1] - best[0]) best = [start, x];
    start = x + 1;
  }
  return best;
}

/** `text`, or as much of it as fits in `width` followed by …; empty if not even that fits. */
function fitText(ctx: Canvas2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  const chars = [...text];
  while (chars.length > 0 && ctx.measureText(`${chars.join('')}…`).width > width) chars.pop();
  return chars.length > 0 ? `${chars.join('')}…` : '';
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

/**
 * A curse moved the piece by itself: a white afterimage where it was, speed lines streaming off
 * the side it left, and the curse's sign popping up over it, so viewers see it wasn't the player.
 */
function paintNudge(
  ctx: Canvas2D,
  piece: ActivePiece,
  nudge: NudgeView,
  ageMs: number,
  size: number,
): void {
  if (ageMs < 0 || ageMs >= NUDGE_ICON_MS) return;
  const cells = pieceCells(piece.matrix, piece.x, piece.y).filter(([, y]) => y >= 0);
  if (cells.length === 0) return;
  ctx.save();
  if (ageMs < NUDGE_MS) {
    const k = ageMs / NUDGE_MS;
    // The afterimage slides after the piece as it fades.
    ctx.fillStyle = FLASH;
    ctx.globalAlpha = 0.5 * (1 - k);
    const shift = -nudge.dx * (1 - k);
    for (const [x, y] of cells) {
      ctx.fillRect((x + shift) * size + 1, y * size + 1, size - 2, size - 2);
    }
    // Speed lines off each row's trailing edge.
    ctx.globalAlpha = 0.75 * (1 - k);
    const edges = new Map<number, number>();
    for (const [x, y] of cells) {
      const edge = nudge.dx > 0 ? x : x + 1;
      const seen = edges.get(y);
      edges.set(
        y,
        seen === undefined ? edge : nudge.dx > 0 ? Math.min(seen, edge) : Math.max(seen, edge),
      );
    }
    for (const [y, edge] of edges) {
      for (const [at, scale, thick] of [
        [0.3, 1, 0.12],
        [0.7, 0.6, 0.08],
      ] as const) {
        const length = size * (1 + k) * scale;
        const x0 = nudge.dx > 0 ? edge * size - length : edge * size;
        ctx.fillRect(x0, y * size + size * at, length, Math.max(1, size * thick));
      }
    }
  }
  const icon = NUDGE_ICONS[nudge.by];
  if (icon) {
    const k = ageMs / NUDGE_ICON_MS;
    const xs = cells.map(([x]) => x);
    const top = Math.min(...cells.map(([, y]) => y));
    ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    ctx.font = `${Math.round(size * 1.2)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      icon,
      ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * size,
      Math.max(size, top * size - size * 0.6 * k),
    );
  }
  ctx.restore();
}

/**
 * 摸鱼: the board as a spreadsheet. Column letters across the top row, filled cells as plain
 * cells with numbers in them, the falling pieces as the selection; no colours, no ghost.
 */
function paintSheet(ctx: Canvas2D, view: BoardView, w: number, h: number, size: number): void {
  ctx.save();
  ctx.fillStyle = SHEET.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = SHEET.header;
  ctx.fillRect(0, 0, cols * size, size);
  ctx.strokeStyle = SHEET.grid;
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
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size * 0.5)}px system-ui, sans-serif`;
  ctx.fillStyle = SHEET.headerText;
  for (let c = 0; c < cols; c += 1) {
    ctx.fillText(String.fromCharCode(65 + c), (c + 0.5) * size, size / 2);
  }
  ctx.font = `${Math.round(size * 0.42)}px ui-monospace, monospace`;
  view.board.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (!cell) return;
      ctx.fillStyle = SHEET.cell;
      ctx.fillRect(x * size + 1, y * size + 1, size - 1, size - 1);
      ctx.fillStyle = SHEET.text;
      // Any number will do, as long as it stays put.
      ctx.fillText(
        String((((x + 3) * 37 + (y + 5) * 53) % 90) + 10),
        (x + 0.5) * size,
        (y + 0.5) * size,
      );
    }),
  );
  ctx.lineWidth = 2;
  for (const piece of [view.active, view.twin]) {
    if (!piece) continue;
    for (const [x, y] of pieceCells(piece.matrix, piece.x, piece.y)) {
      if (y < 0) continue;
      ctx.fillStyle = SHEET.selectFill;
      ctx.fillRect(x * size, y * size, size, size);
      ctx.strokeStyle = SHEET.select;
      ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
    }
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
 * Marks a cursed piece so the player knows it is the curse: a pulsing veil over its cells, then a
 * flare around each cell, a dashed outline marching around it, or static hatching across it.
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
