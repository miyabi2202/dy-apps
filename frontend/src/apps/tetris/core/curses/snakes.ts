import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

/** 烂牌: the next few pieces become S or Z, which the preview shows. */
export const snakes = defineCurse({
  type: 'snakes',
  name: '烂牌',
  description: (config) => `接下来 ${config.effects.snakesPieces} 块全是 S 或 Z`,
  rarity: 'uncommon',
  queue: 'c',
  apply(ctx) {
    for (let i = 0; i < CONFIG.effects.snakesPieces; i += 1) {
      ctx.setUpcoming(i, randomInt(ctx.curseRng, 2) === 0 ? 'S' : 'Z');
    }
  },
});
