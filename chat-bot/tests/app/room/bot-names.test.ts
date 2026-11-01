import { BotNames } from '../../../src/app/room/bot-names';

test('the bot is called by its nickname first, then the room’s aliases, which are the names besides its own', () => {
  const names = new BotNames({
    botName: '小助手',
    botId: 'bot-1',
    aliases: () => [{ name: 'Fairy', heardAs: ['ferry'] }],
  });
  expect(names.callNames()).toEqual([
    { name: '小助手', heardAs: [] },
    { name: 'Fairy', heardAs: ['ferry'] },
  ]);
  expect(names.aliases()).toEqual(['Fairy']);
  expect(names.botId).toBe('bot-1');
});
