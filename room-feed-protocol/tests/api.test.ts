import { isRoomId, parsePort, roomIdFrom } from '../src/api';

describe('parsePort and isRoomId', () => {
  it('accepts ports 1–65535 written as plain digits', () => {
    expect(parsePort('8757')).toBe(8757);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
    for (const bad of ['', '0', '65536', '87.5', '-1', ' 8757', 'abc']) {
      expect(parsePort(bad)).toBeNull();
    }
  });

  it('accepts room numbers made of digits only', () => {
    expect(isRoomId('167920210669')).toBe(true);
    for (const bad of ['', '1679 2021', 'abc', 'live.douyin.com/1']) {
      expect(isRoomId(bad)).toBe(false);
    }
  });
});

describe('roomIdFrom', () => {
  it.each([
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
