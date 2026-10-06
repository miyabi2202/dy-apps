import type { BoardView, PieceShape } from '../core/types';
import { prepare } from './canvas';
import { paintBoard, paintMiniPiece } from './paint';

/** Draw the board into a canvas, sized for its devicePixelRatio. */
export function drawBoard(canvas: HTMLCanvasElement, view: BoardView): void {
  const prepared = prepare(canvas);
  if (prepared) paintBoard(prepared.ctx, view, prepared.w, prepared.h);
}

/** Draw one piece (hold or preview) into a small canvas. */
export function drawMiniPiece(
  canvas: HTMLCanvasElement,
  shape: PieceShape | null,
  dim = false,
): void {
  const prepared = prepare(canvas);
  if (prepared) paintMiniPiece(prepared.ctx, shape, dim, prepared.w, prepared.h);
}
