import { defineCurse } from './types';

/**
 * 夺舍: chat takes the next piece. Play stops while viewers queue 左, 右 and 转 (左右左右 is four
 * moves); then the piece falls as usual while they play out, one every `stepMs`, and soft-drops
 * after the last. Moves left when it lands are lost.
 */
export const possess = defineCurse({
  type: 'possess',
  name: '夺舍',
  description: (config) => {
    const { programMs, stepMs, maxSteps } = config.possess;
    return `暂停 ${programMs / 1000} 秒，观众发弹幕「左」「右」「转」给下一块排操作（「左右左右」算 4 步，最多 ${maxSteps} 步）；倒计时结束后方块照常下落，每 ${stepMs} ms 执行一步，没执行完就落地的话剩下的作废，执行完自动软降；这一块主播不能操作`;
  },
  rarity: 'rare',
  queue: 'e',
  apply: () => ({ possess: true }),
});
