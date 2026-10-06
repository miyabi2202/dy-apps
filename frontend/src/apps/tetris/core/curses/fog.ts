import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 迷雾: the preview is hidden while it lasts. */
export const fog = defineCurse({
  type: 'fog',
  name: '迷雾',
  description: (config) => `隐藏预览 ${config.effects.fogLocks} 块，可叠加`,
  rarity: 'common',
  queue: 'c',
  durationLocks: CONFIG.effects.fogLocks,
  hidesPreview: true,
});
