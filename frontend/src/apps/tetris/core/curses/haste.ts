import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 加速: the drop interval shrinks for the rest of the game, stacking. */
export const haste = defineCurse({
  type: 'haste',
  name: '加速',
  description: (config) =>
    `下降间隔永久 ×${config.gravity.hasteMultiplier}，可叠加，最快 ${config.gravity.minMs} ms/格`,
  rarity: 'rare',
  queue: 'b',
  apply(ctx) {
    ctx.multiplyGravity(CONFIG.gravity.hasteMultiplier);
  },
});
