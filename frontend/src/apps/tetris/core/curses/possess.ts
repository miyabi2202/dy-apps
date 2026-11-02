import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 夺舍: the viewers steer the piece from chat (左, 右, 转) and the player can't touch it. */
export const possess = defineCurse({
  type: 'possess',
  name: '夺舍',
  description: (config) => {
    const { left, right, rotate } = config.viewerCommands;
    return `观众发弹幕「${left}」「${right}」「${rotate}」直接操控方块，每条立即生效；主播不能操作，持续 ${config.effects.possessLocks} 块`;
  },
  rarity: 'rare',
  queue: 'e',
  cutscene: true,
  tagline: '我行我上了',
  cutsceneMs: CONFIG.effects.possessIntroMs,
  durationLocks: CONFIG.effects.possessLocks,
  viewerControl: true,
  blocks: ['move', 'rotate', 'hold', 'softDrop', 'hardDrop'],
});
