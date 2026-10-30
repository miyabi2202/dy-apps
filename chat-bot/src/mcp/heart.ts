import { errorMessage } from '../core/errors';
import type { BotTool, Log, SendHeart } from '../app/ports';

/**
 * `send_heart`: sends the streamer one 小心心 (1 diamond) as the bot's account, from the gift
 * panel. One a call, and a tool runs once a question, so one an ask. Admin-only. `/小心心` calls it
 * directly. It's done in silence, like the 灯牌: asked in words, the bot sends nothing back, but
 * 「钻石不够送小心心」 when room-feed had too few diamonds to send it. The log has the diamonds
 * left, or how many there were.
 */
/** What the bot says when the diamonds are too few. */
const NOT_ENOUGH = '钻石不够送小心心';

export function heartTool(send: SendHeart, log: Log): BotTool {
  return {
    name: 'send_heart',
    description:
      '给主播送 1 个「小心心」礼物（1 钻）。有人要你送小心心、送个心心、比个心送礼时调用（你有这个工具，就说明问的人有权叫你送）。一次只送 1 个，要几个也只送 1 个；没有钻石就送不了。调用后程序什么都不发，你也什么都不用说。',
    adminOnly: true,
    inputSchema: { type: 'object', properties: {} },
    commands: [
      {
        name: '小心心',
        parse: (args) => (args.trim() ? { usage: '用法：/小心心（不用写别的）' } : { args: {} }),
        // Sending it says nothing in the room.
        say: () => '',
      },
    ],
    async call(_args, { asker }) {
      try {
        const sent = await send();
        switch (sent.result) {
          case 'sent':
            log.info('sent heart', { asker, diamondsLeft: sent.diamondsLeft });
            // Sent: the program has answered them, so Claude says nothing.
            return {
              text: JSON.stringify({ sent: true, diamondsLeft: sent.diamondsLeft }),
              silent: true,
            };
          case 'notEnough':
            log.info('not enough diamonds for a heart', {
              asker,
              diamonds: sent.diamonds,
              price: sent.price,
            });
            // The bot says so itself, without the numbers, and Claude says nothing.
            return { text: JSON.stringify({ sent: false }), silent: true, say: NOT_ENOUGH };
        }
      } catch (err) {
        log.warn('could not send a heart', { asker, error: errorMessage(err) });
        return { text: '现在送不了小心心，请稍后再试', isError: true };
      }
    },
  };
}
