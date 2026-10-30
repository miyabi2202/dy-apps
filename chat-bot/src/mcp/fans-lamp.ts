import { errorMessage } from '../core/errors';
import type { BotTool, Log, SendFansLamp } from '../app/ports';

/**
 * `send_fans_lamp`: sends the streamer today's 粉丝团灯牌 (2 diamonds) as the bot's account, which
 * also joins the 粉丝团 when it hasn't yet, following the streamer first if need be. Douyin takes
 * one a day: when today's was sent before, nothing is sent. Admin-only. `/灯牌` calls it directly.
 * It's done in silence, sent or not: asked in words, the bot sends nothing back, but
 * 「钻石不够点灯牌」 when room-feed had too few diamonds to send it. The log has whether it was
 * sent, or how many diamonds there were.
 */
/** What the bot says when the diamonds are too few. */
const NOT_ENOUGH = '钻石不够点灯牌';

export function fansLampTool(send: SendFansLamp, log: Log): BotTool {
  return {
    name: 'send_fans_lamp',
    description:
      '给主播点亮今天的粉丝团灯牌（送 1 个 2 钻的「灯牌」，还没加粉丝团的会顺便加入，没关注会先关注）。有人要你加灯牌、点灯牌、卡灯牌、加入粉丝团时调用（你有这个工具，就说明问的人有权叫你点）。一天只能点一次，今天点过就不会再送；钻石不够 2 个就点不了。调用后程序什么都不发，你也什么都不用说。',
    adminOnly: true,
    inputSchema: { type: 'object', properties: {} },
    commands: [
      {
        name: '灯牌',
        parse: (args) => (args.trim() ? { usage: '用法：/灯牌（不用写别的）' } : { args: {} }),
        // Lighting it says nothing in the room.
        say: () => '',
      },
    ],
    async call(_args, { asker }) {
      try {
        const sent = await send();
        switch (sent.result) {
          case 'sent':
          case 'already':
            log.info('fans lamp', { asker, result: sent.result });
            // Sent or already: the program has answered them, so Claude says nothing.
            return { text: JSON.stringify({ sent: true, result: sent.result }), silent: true };
          case 'notEnough':
            log.info('not enough diamonds for the fans lamp', {
              asker,
              diamonds: sent.diamonds,
              price: sent.price,
            });
            // The bot says so itself, without the numbers, and Claude says nothing.
            return { text: JSON.stringify({ sent: false }), silent: true, say: NOT_ENOUGH };
        }
      } catch (err) {
        log.warn('could not send the fans lamp', { asker, error: errorMessage(err) });
        return { text: '现在点不了灯牌，请稍后再试', isError: true };
      }
    },
  };
}
