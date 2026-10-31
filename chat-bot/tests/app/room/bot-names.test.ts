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

test('without aliases, trim marks or a time zone it has none', () => {
  const names = new BotNames({ botName: '小助手' });
  expect(names.aliases()).toEqual([]);
  expect(names.atTrimStart()).toEqual([]);
  expect(names.timeZone()).toBeUndefined();
});

test('the room’s aliases, trim marks and time zone are read each time', () => {
  let zone = 'Asia/Shanghai';
  const names = new BotNames({ botName: 'x', timeZone: () => zone, atTrimStart: () => ['⊹'] });
  expect(names.timeZone()).toBe('Asia/Shanghai');
  zone = 'Asia/Tokyo';
  expect(names.timeZone()).toBe('Asia/Tokyo');
  expect(names.atTrimStart()).toEqual(['⊹']);
});
