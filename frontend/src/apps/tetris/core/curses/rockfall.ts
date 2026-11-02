import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

/**
 * 落石: one or more single stones drop into random columns and land on whatever is there. A
 * stone with no room left in its column ends the game.
 */
export const rockfall = defineCurse({
  type: 'rockfall',
  name: '落石',
  description: (config) => `随机几列顶上各落下 1 块石头，最多 ${config.effects.rockfallMax} 块`,
  rarity: 'uncommon',
  queue: 'e',
  apply(ctx) {
    const { board } = ctx;
    const stones = 1 + randomInt(ctx.garbageRng, CONFIG.effects.rockfallMax);
    const dropped: [number, number][] = [];
    for (let i = 0; i < stones; i += 1) {
      const x = randomInt(ctx.garbageRng, board[0]!.length);
      const top = board.findIndex((row) => row[x] !== null);
      const y = (top === -1 ? board.length : top) - 1;
      if (y < 0) return { gameOver: '落石砸在了顶部', dropped };
      board[y]![x] = 'G';
      dropped.push([x, y]);
    }
    return { dropped };
  },
});
