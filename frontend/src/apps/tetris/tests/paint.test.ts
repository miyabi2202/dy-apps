import { createBoard } from '../core/board';
import { CONFIG } from '../core/config';
import { createPiece, shapeOf } from '../core/pieces';
import type { BoardView } from '../core/types';
import type { Canvas2D } from '../render/canvas';
import { paintBoard, paintMiniPiece, PIECE_COLORS } from '../render/paint';

const { cols, rows } = CONFIG.board;
/** One logical pixel per 10 so cell (x, y) starts at (10x + 1, 10y + 1). */
const SIZE = 10;
const W = cols * SIZE;
const H = rows * SIZE;

interface Call {
  op: string;
  args: number[];
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
}

/** Every character measures one cell wide, so a cell fits one character. */
const CHAR_WIDTH = SIZE;

/**
 * A Canvas2D that records every drawing call with the style it was made in, and the text it
 * fills with where.
 */
function recorder(): Canvas2D & { calls: Call[]; texts: [string, number, number][] } {
  const calls: Call[] = [];
  const texts: [string, number, number][] = [];
  const ctx = {
    calls,
    texts,
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    lineDashOffset: 0,
    lineJoin: 'miter',
    fillText: (text: string, x: number, y: number) => texts.push([text, x, y]),
    measureText: (text: string) => ({ width: [...text].length * CHAR_WIDTH }),
  } as unknown as Canvas2D & { calls: Call[]; texts: [string, number, number][] };
  const ops = [
    'fillRect',
    'strokeRect',
    'clearRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'setLineDash',
    'save',
    'restore',
    'translate',
    'strokeText',
  ] as const;
  for (const op of ops) {
    (ctx as unknown as Record<string, unknown>)[op] = (...args: (number | number[])[]) => {
      calls.push({
        op,
        args: args.flat(),
        fillStyle: ctx.fillStyle,
        strokeStyle: ctx.strokeStyle,
        globalAlpha: ctx.globalAlpha,
      });
    };
  }
  return ctx;
}

/** Cells filled (the body of a cell, not its highlight strip) with `color`. */
function filledCells(calls: Call[], color: string): [number, number][] {
  return calls
    .filter((c) => c.op === 'fillRect' && c.fillStyle === color && c.args[3] === SIZE - 2)
    .map((c) => [(c.args[0]! - 1) / SIZE, (c.args[1]! - 1) / SIZE]);
}

function view(partial: Partial<BoardView>): BoardView {
  return { board: createBoard(), active: null, ghostY: null, ...partial };
}

describe('paintBoard', () => {
  it('paints locked cells in their colour', () => {
    const board = createBoard();
    board[rows - 1]![0] = 'G';
    board[rows - 1]![1] = 'T';
    const ctx = recorder();
    paintBoard(ctx, view({ board }), W, H);
    expect(filledCells(ctx.calls, PIECE_COLORS.G)).toEqual([[0, rows - 1]]);
    expect(filledCells(ctx.calls, PIECE_COLORS.T)).toEqual([[1, rows - 1]]);
  });

  it('strokes the ghost at ghostY, faded, and fills the piece where it is', () => {
    const active = createPiece(shapeOf('O'));
    const ctx = recorder();
    paintBoard(ctx, view({ active, ghostY: rows - 2 }), W, H);
    const ghost = ctx.calls.filter((c) => c.op === 'strokeRect');
    expect(ghost).toHaveLength(4);
    expect(ghost.every((c) => c.strokeStyle === PIECE_COLORS.O && c.globalAlpha < 1)).toBe(true);
    expect(ghost.map((c) => (c.args[1]! - 2) / SIZE).sort()).toEqual([
      rows - 2,
      rows - 2,
      rows - 1,
      rows - 1,
    ]);
    expect(filledCells(ctx.calls, PIECE_COLORS.O)).toEqual([
      [4, 0],
      [5, 0],
      [4, 1],
      [5, 1],
    ]);
  });

  it("prints a row's name on its longest run of cells, cut short with … if it doesn't fit", () => {
    const board = createBoard();
    // Columns 3 to 9 are the longest run: 7 cells, room for 6 characters after the margin.
    board[rows - 1] = board[rows - 1]!.map((_, x) => (x === 2 ? null : 'G'));
    board[rows - 2] = board[rows - 2]!.map((_, x) => (x === 2 ? null : 'G'));
    const rowLabels = Array.from({ length: rows }, () => null as string | null);
    rowLabels[rows - 1] = '阿杰';
    rowLabels[rows - 2] = '一只超级无敌大猫咪';
    const ctx = recorder();
    paintBoard(ctx, view({ board, rowLabels }), W, H);
    const centre = 6.5 * SIZE;
    expect(ctx.texts).toEqual([
      ['一只超级无…', centre, (rows - 1.5) * SIZE + 0.5],
      ['阿杰', centre, (rows - 0.5) * SIZE + 0.5],
    ]);
  });

  it("marks a piece a curse moved by itself: an afterimage where it was and the curse's sign over it", () => {
    const active = { ...createPiece(shapeOf('O')), y: 5 };
    const nudge = { atMs: 1000, by: 'drunk', dx: 1 } as const;
    const ctx = recorder();
    paintBoard(ctx, view({ active, ghostY: rows - 2, nudge, timeMs: 1000 }), W, H);
    // The afterimage starts a whole column back, at the cells the piece came from.
    expect(filledCells(ctx.calls, '#ffffff')).toEqual([
      [3, 5],
      [4, 5],
      [3, 6],
      [4, 6],
    ]);
    expect(ctx.texts.map(([text]) => text)).toEqual(['🍺']);

    const later = recorder();
    paintBoard(later, view({ active, ghostY: rows - 2, nudge, timeMs: 3000 }), W, H);
    expect(filledCells(later.calls, '#ffffff')).toEqual([]);
    expect(later.texts).toEqual([]);
  });

  it('shouts a big clear and its combo, then lets it go', () => {
    const callout = { atMs: 1000, combo: 3, lines: 4, swept: 1, row: rows - 3 };
    const ctx = recorder();
    paintBoard(ctx, view({ callout, timeMs: 1500 }), W, H);
    expect(ctx.texts.map(([text]) => text)).toEqual(['TETRIS!', 'COMBO ×3', '清底 +1']);
    const later = recorder();
    paintBoard(later, view({ callout, timeMs: 5000 }), W, H);
    expect(later.texts).toEqual([]);
  });

  it('glows red inside the edges while in danger, brighter on the beat', () => {
    const glow = (timeMs: number) => {
      const ctx = recorder();
      paintBoard(ctx, view({ danger: { beatAtMs: 1000, level: 0.5 }, timeMs }), W, H);
      return ctx.calls.filter((c) => c.op === 'strokeRect' && c.strokeStyle === '#ef4444');
    };
    expect(glow(1000)).toHaveLength(4);
    expect(glow(1000)[0]!.globalAlpha).toBeGreaterThan(glow(3000)[0]!.globalAlpha);
    const safe = recorder();
    paintBoard(safe, view({}), W, H);
    expect(safe.calls.some((c) => c.strokeStyle === '#ef4444')).toBe(false);
  });

  it('skips cells above the visible top', () => {
    const active = { ...createPiece(shapeOf('O')), y: -1 };
    const ctx = recorder();
    paintBoard(ctx, view({ active, ghostY: -1 }), W, H);
    expect(filledCells(ctx.calls, PIECE_COLORS.O)).toEqual([
      [4, 0],
      [5, 0],
    ]);
    expect(ctx.calls.filter((c) => c.op === 'strokeRect')).toHaveLength(2);
  });
});

describe('paintMiniPiece', () => {
  it('clears the slot and paints nothing for an empty one', () => {
    const ctx = recorder();
    paintMiniPiece(ctx, null, false, 76, 44);
    expect(ctx.calls.map((c) => c.op)).toEqual(['clearRect']);
  });

  it('paints a dimmed piece in its colour', () => {
    const ctx = recorder();
    paintMiniPiece(ctx, shapeOf('T'), true, 76, 44);
    const cells = ctx.calls.filter((c) => c.op === 'fillRect' && c.fillStyle === PIECE_COLORS.T);
    expect(cells).toHaveLength(4);
    expect(cells.every((c) => c.globalAlpha === 0.35)).toBe(true);
  });
});
