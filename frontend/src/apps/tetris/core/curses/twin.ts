import { CONFIG } from '../config';
import { defineCurse } from './types';

/**
 * 双落: the next piece comes with the one after it, side by side. They move and fall together;
 * one that lands locks and the other plays on, and the next comes once both are down.
 */
export const twin = defineCurse({
  type: 'twin',
  name: '双落',
  description: (config) =>
    `两块并排一起掉，一起操纵；一块落地后另一块继续，持续 ${config.effects.twinLocks} 次`,
  rarity: 'rare',
  queue: 'e',
  cutscene: true,
  tagline: '连块都有对象',
  durationLocks: CONFIG.effects.twinLocks,
  spawnsTwin: true,
});
