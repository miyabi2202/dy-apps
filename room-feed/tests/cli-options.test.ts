import { parseCliOptions } from '../src/cli-options';

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
