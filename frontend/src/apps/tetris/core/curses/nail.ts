import { randomInt } from '../random';
import { defineCurse } from './types';

/**
 * 钉子户: the sender lands as one cell on top of a random column. Its row never clears; once
 * `nailBuryDepth` cells are stacked straight on top of it, it takes the money and moves out,
 * leaving an ordinary cell behind.
 */
export const nail = defineCurse({
  type: 'nail',
  name: '钉子户',
  description: (config) =>
    `送礼人变成一格钉子户，落在随机一列顶上；它在的那一行消不掉，等它头顶压满 ${config.effects.nailBuryDepth} 层才拿钱搬走，变回普通方块`,
  rarity: 'rare',
  queue: 'f',
  cutscene: true,
  tagline: '给多少钱都不搬',
  apply(ctx) {
    const { board } = ctx;
    const open = board[0]!.flatMap((cell, x) => (cell === null ? [x] : []));
    if (open.length === 0) return { gameOver: '钉子户钉在了顶部' };
    const x = open[randomInt(ctx.curseRng, open.length)]!;
    const top = board.findIndex((row) => row[x] !== null);
    return { squat: [x, (top === -1 ? board.length : top) - 1] };
  },
});
