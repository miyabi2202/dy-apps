import { addGarbageRows } from '../board';
import { defineCurse } from './types';

/** 垃圾行: one garbage row from the bottom; pushing blocks off the top ends the game. */
export const garbage = defineCurse({
  type: 'garbage',
  name: '垃圾行',
  description: () => '底部加 1 行垃圾',
  apply(ctx) {
    if (addGarbageRows(ctx.board, 1, ctx.garbageRng)) return { gameOver: '垃圾行将方块挤出顶部' };
  },
});
