import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 封存: hold is disabled while it lasts; the stored piece stays. */
export const seal = defineCurse({
  type: 'seal',
  name: '封存',
  description: (config) => `禁用暂存 ${config.effects.sealLocks} 块`,
  durationLocks: CONFIG.effects.sealLocks,
  blocks: ['hold'],
});
