import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 急躁: no lock delay, so a piece locks the moment it touches down. Marked on the piece. */
export const hasty = defineCurse({
  type: 'hasty',
  name: '急躁',
  description: (config) => `方块一碰底就立刻落定，持续 ${config.effects.hastyRounds} 轮`,
  rarity: 'common',
  queue: 'e',
  durationRounds: CONFIG.effects.hastyRounds,
  lockDelayMultiplier: 0,
});
