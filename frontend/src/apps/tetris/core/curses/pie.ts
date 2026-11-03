import { CONFIG } from '../config';
import { randomInt } from '../random';
import { defineCurse } from './types';

/**
 * 画饼: the preview promises I pieces, but they are really S or Z. Each shows its true shape only
 * as it spawns. The piece about to spawn is left alone, so the promise stays in the preview a while.
 */
export const pie = defineCurse({
  type: 'pie',
  name: '画饼',
  description: (config) =>
    `预览里下一块之后的 ${config.effects.piePieces} 块都显示成 I，实际来的全是 S 或 Z，出场时才现原形`,
  rarity: 'common',
  queue: 'c',
  tagline: '下一块一定是 I',
  apply(ctx) {
    const count = CONFIG.effects.piePieces;
    for (let i = 0; i < count; i += 1) {
      ctx.setUpcoming(1 + i, randomInt(ctx.curseRng, 2) === 0 ? 'S' : 'Z');
    }
    return { promise: { shown: 'I', from: 1, count } };
  },
});
