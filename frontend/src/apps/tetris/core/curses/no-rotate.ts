import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 禁转: the piece cannot be rotated while it lasts. */
export const noRotate = defineCurse({
  type: 'noRotate',
  name: '禁转',
  description: (config) => `方块无法旋转，持续 ${config.effects.noRotateLocks} 块`,
  rarity: 'rare',
  queue: 'e',
  durationLocks: CONFIG.effects.noRotateLocks,
  blocks: ['rotate'],
});
