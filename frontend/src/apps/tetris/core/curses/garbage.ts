import { addGarbageRows } from '../board';
import { defineCurse } from './types';

/**
 * 垃圾行: one garbage row from the bottom, with the sender's name on it; pushing blocks off the
 * top ends the game.
 */
export const garbage = defineCurse({
  type: 'garbage',
  name: '垃圾行',
  description: () => '底部加 1 行垃圾，印着送的人的名字',
  rarity: 'rare',
  queue: 'a',
  apply(ctx) {
    const overflow = addGarbageRows(ctx.board, 1, ctx.garbageRng);
    ctx.signRow(ctx.board.length - 1);
    if (overflow) return { gameOver: '垃圾行将方块挤出顶部' };
  },
});
