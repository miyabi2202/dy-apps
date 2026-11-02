import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 延迟: every command the player gives acts `lagMs` late, so a burst of presses all lands late. */
export const lag = defineCurse({
  type: 'lag',
  name: '延迟',
  description: (config) =>
    `所有操作晚 ${config.effects.lagMs / 1000} 秒才生效，持续 ${config.effects.lagLocks} 块`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '网卡了',
  durationLocks: CONFIG.effects.lagLocks,
  inputDelayMs: CONFIG.effects.lagMs,
});
