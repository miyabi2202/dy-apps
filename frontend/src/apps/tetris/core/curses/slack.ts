import { CONFIG } from '../config';
import { defineCurse } from './types';

/** 摸鱼: the boss walks by, so the board passes itself off as a spreadsheet for a round. */
export const slack = defineCurse({
  type: 'slack',
  name: '摸鱼',
  description: (config) =>
    `棋盘伪装成 Excel 表格：方块变成写着数字的单元格，看不出颜色，没有落点提示，持续 ${config.effects.slackRounds} 轮`,
  rarity: 'common',
  queue: 'e',
  cutscene: true,
  tagline: '老板来了，快切 Excel！',
  durationRounds: CONFIG.effects.slackRounds,
  boardEffect: 'excel',
});
