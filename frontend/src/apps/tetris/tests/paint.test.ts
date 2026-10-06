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

/** A Canvas2D that records every drawing call with the style it was made in. */
function recorder(): Canvas2D & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    calls,
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
  } as Canvas2D & { calls: Call[] };
  const ops = [
    'fillRect',
    'strokeRect',
    'clearRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'save',
    'restore',
    'translate',
  ] as const;
  for (const op of ops) {
    ctx[op] = (...args: number[]) => {
      calls.push({
        op,
        args,
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
