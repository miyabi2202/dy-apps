import { BotNames, type BotNamesOptions } from '../../src/app/room/bot-names';

/** What the bot is called in a test room: 小助手, unless `options` say otherwise. */
export function fakeNames(options: Partial<BotNamesOptions> = {}): BotNames {
  return new BotNames({ botName: '小助手', ...options });
}
