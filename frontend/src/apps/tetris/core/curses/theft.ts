import { randomInt } from '../random';
import type { Board } from '../types';
import { defineCurse } from './types';

/** The row with the most cells, the lowest of them on a tie: where a missing cell hurts most. */
function fullestRow(board: Board): number {
  let best = -1;
  let most = 0;
  board.forEach((row, y) => {
    const n = row.filter(Boolean).length;
    if (n > 0 && n >= most) {
      best = y;
      most = n;
    }
  });
  return best;
}

/**
 * 小偷: play holds while a thief wearing the sender's face sneaks in from the farther side,
 * lifts one cell out of the fullest row and runs out the nearer side with it. Waits, pending,
 * while the board is empty.
 */
export const theft = defineCurse({
  type: 'theft',
  name: '小偷',
  description: () =>
    '暂停游戏，一个顶着送礼人头像的小偷从最满的那一行偷走一格：从离那一格远的一边溜进来，偷完从近的一边飞快跑掉',
  tagline: '放这里我以为没人要呢',
  rarity: 'uncommon',
  queue: 'e',
  ready: (ctx) => fullestRow(ctx.board) !== -1,
  apply(ctx) {
    const y = fullestRow(ctx.board);
    const xs = ctx.board[y]!.flatMap((cell, x) => (cell ? [x] : []));
    return { steal: [xs[randomInt(ctx.curseRng, xs.length)]!, y] };
  },
});
