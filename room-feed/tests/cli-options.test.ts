import { parseCliOptions, roomIdFrom } from '../src/cli-options';

describe('roomIdFrom', () => {
  it.each([
    ['123456', '123456'],
    [' 123456 ', '123456'],
    ['１２３', '123'],
    ['https://live.douyin.com/484088206186?enter_from=web', '484088206186'],
  ])('reads %s', (input, roomId) => {
    expect(roomIdFrom(input)).toBe(roomId);
  });

  it('finds no room number in other text', () => {
    expect(roomIdFrom('https://www.douyin.com/user/abc')).toBeNull();
    expect(roomIdFrom('12 34')).toBeNull();
  });
});

describe('parseCliOptions', () => {
  it('serves a room on the default port', () => {
    expect(parseCliOptions(['--room', 'live.douyin.com/42'])).toEqual({
      command: 'serve',
      roomId: '42',
      port: 8757,
      headed: false,
    });
  });

  it('logs in', () => {
    expect(parseCliOptions(['login', '--chrome', 'C:\\chrome.exe'])).toEqual({
      command: 'login',
      chrome: 'C:\\chrome.exe',
    });
  });

  it.each([[[]], [['--room', 'abc']], [['--room', '1', '--port', '70000']], [['logout']]])(
    'rejects %j',
    (argv) => {
      expect(parseCliOptions(argv)).toHaveProperty('error');
    },
  );
});
