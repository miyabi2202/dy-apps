import { CONFIG } from '../config';
import { defineCurse } from './types';

/**
 * 延迟: every command the player gives acts a random 0 to `lagMaxMs` late, so a later press can
 * act before an earlier one, and some are lost on the way.
 */
export const lag = defineCurse({
  type: 'lag',
  name: '延迟',
  description: (config) =>
    `每个操作随机晚 0～${config.effects.lagMaxMs / 1000} 秒才生效，后按的可能先到，还有 ${config.effects.lagLossChance * 100}% 会丢包，持续 ${config.effects.lagRounds} 轮`,
  rarity: 'uncommon',
  queue: 'e',
  cutscene: true,
  tagline: '网卡了',
  durationRounds: CONFIG.effects.lagRounds,
  maxInputDelayMs: CONFIG.effects.lagMaxMs,
  inputLossChance: CONFIG.effects.lagLossChance,
});
