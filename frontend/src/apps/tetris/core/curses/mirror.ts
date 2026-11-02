import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 镜像: the player's left and right moves are swapped. */
export const mirror = defineCurse({
  type: 'mirror',
  name: '镜像',
  description: (config) => `左右移动对调，持续 ${config.effects.mirrorLocks} 块`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '左就是右',
  durationLocks: CONFIG.effects.mirrorLocks,
  mirrorsMoves: true,
});
