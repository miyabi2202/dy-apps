import { errorMessage } from '../../core/errors';
import type { Log } from '../ports';
import type { BotTool, ToolResult } from '../../core/tools/bot-tool';
import { HEART_COOLDOWN_MINUTES, type HeartGate } from './heart-gate';

/** The one gift it sends. */
const HEART = '小心心';

/** What the bot says when the diamonds are too few. */
const NOT_ENOUGH = '钻石不够送小心心';
/** Why another gift wasn't sent, for Claude to say in its own words. */
const onlyHeart = (gift: string) => `只能送小心心，送不了${gift}，这次什么都没送`;
/** Why one within the cooldown of the last wasn't sent: how many minutes are left, rounded up. */
const tooSoon = (minutes: number) =>
  `小心心 ${HEART_COOLDOWN_MINUTES} 分钟只能送一次，还要等 ${minutes} 分钟，这次没送`;

/** Whether `gift` is the 小心心 (or no gift in particular). */
const isHeart = (gift: string) => gift === '' || gift === HEART || gift === '心心';

/**
 * `send_heart`: sends the streamer one 小心心 (1 diamond) as the bot's account, from the gift
 * panel, when someone asks: the only gift it sends, whatever gift it's asked for (`gift`). One a
 * call, and a tool runs once a question, so one an ask; and one in HEART_COOLDOWN_MINUTES, sent unasked or not
 * (the HeartGate it shares with `send_happy_heart`). Admin-only. `/小心心` calls it directly. Sent,
 * it's done in silence, like the 灯牌: asked in words, the bot sends nothing back. Another gift,
 * or too soon, is a failed result, and Claude tells the asker why in its own words (a typed `/`
 * says it as it is); too few diamonds, the bot says so itself. The log has the diamonds left, or why.
 */
export function heartTool(hearts: HeartGate, log: Log): BotTool {
  /** The bot says `say` itself, and Claude says nothing. */
  const notSent = (say: string): ToolResult => ({
    text: JSON.stringify({ sent: false }),
    silent: true,
    say,
  });

  return {
    name: 'send_heart',
    description: `给主播送礼物：只能送「小心心」（1 钻），一次 1 个，${HEART_COOLDOWN_MINUTES} 分钟最多一次。有人要你送礼物、送小心心、送个心心时调用（你有这个工具，就说明问的人有权叫你送）；点名要别的礼物（比如嘉年华、玫瑰）也调用，把礼物名写进 gift，没点名就不写。灯牌不是这个，用 send_fans_lamp。要几个也只送 1 个。送了，程序什么都不发，你也什么都不用说；没送，结果会写明原因（点名的礼物送不了、${HEART_COOLDOWN_MINUTES} 分钟内送过了），你用自己的话简短告诉对方。`,
    adminOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        gift: { type: 'string', description: '点名要送的礼物，没点名就不写' },
      },
    },
    commands: [
      {
        name: HEART,
        parse: (args) => (args.trim() ? { usage: '用法：/小心心（不用写别的）' } : { args: {} }),
        // Sending it says nothing in the room.
        say: () => '',
      },
    ],
    async call(args, { asker }) {
      const gift = typeof args.gift === 'string' ? args.gift.trim() : '';
      if (!isHeart(gift)) {
        log.info('asked for another gift', { asker, gift });
        return { text: onlyHeart(gift), isError: true };
      }
      try {
        const sent = await hearts.send();
        switch (sent.result) {
          case 'sent':
            log.info('sent heart', { asker, diamondsLeft: sent.diamondsLeft });
            // Sent: the program has answered them, so Claude says nothing.
            return {
              text: JSON.stringify({ sent: true, diamondsLeft: sent.diamondsLeft }),
              silent: true,
            };
          case 'tooSoon':
            log.info('heart too soon', { asker, waitMs: sent.waitMs });
            return { text: tooSoon(Math.ceil(sent.waitMs / 60_000)), isError: true };
          case 'notEnough':
            log.info('not enough diamonds for a heart', {
              asker,
              diamonds: sent.diamonds,
              price: sent.price,
            });
            return notSent(NOT_ENOUGH);
        }
      } catch (err) {
        log.warn('could not send a heart', { asker, error: errorMessage(err) });
        return { text: '现在送不了小心心，请稍后再试', isError: true };
      }
    },
  };
}
