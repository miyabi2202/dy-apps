import type { GiftThanker } from '../app/replies/gift-thanker';
import type { BotTool, Log } from '../app/ports';
import { numberTool } from './setting-tools';

/** The threshold that leaves gifts unthanked, as `/自动谢礼 99999` does. */
const OFF = 99999;

/**
 * `set_thanks_threshold`: the automatic thanks' threshold, for an admin who asks in words (「以后
 * 100 钻以下的礼物不用谢了」「把谢礼关了」) or types `/自动谢礼 <钻>`. It's a `numberTool`, which also
 * says whether the thanks are on after the change. Admin-only, so anyone else's question doesn't
 * have it.
 */
export function setThanksThresholdTool(thanker: Pick<GiftThanker, 'threshold'>, log: Log): BotTool {
  return numberTool({
    name: 'set_thanks_threshold',
    command: '自动谢礼',
    description: `改自动谢礼的门槛：观众 5 分钟内送的礼物超过 diamonds 钻就谢 TA。有人要开、关自动谢礼或改门槛时调用（「以后 100 钻以下的礼物不用谢了」就填 100）；关掉就填 ${OFF}。`,
    arg: { name: 'diamonds', description: `钻石数；关掉自动谢礼填 ${OFF}` },
    integer: true,
    min: 0,
    usage: '阈值要写成钻石数，用法：/自动谢礼 100',
    get: () => thanker.threshold,
    set: (diamonds) => (thanker.threshold = diamonds),
    extra: (diamonds) => ({ on: diamonds < OFF }),
    log,
  });
}
