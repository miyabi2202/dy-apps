import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 加速: the drop interval shrinks while it lasts; overlapping hastes multiply. */
export const haste = defineCurse({
  type: 'haste',
  name: '加速',
  description: (config) =>
    `下降间隔 ×${config.gravity.hasteMultiplier}，持续 ${config.effects.hasteRounds} 轮，同时生效时相乘`,
  rarity: 'uncommon',
  queue: 'b',
  durationRounds: CONFIG.effects.hasteRounds,
  gravityMultiplier: CONFIG.gravity.hasteMultiplier,
});
