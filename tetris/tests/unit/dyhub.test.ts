import { dyhubUrl, isRoomId, parsePort } from '../../src/adapters/dyhub';

describe('dyhub settings', () => {
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

  it('always targets localhost with the chat and gift streams', () => {
    expect(dyhubUrl(8757, '167920210669')).toBe(
      'ws://localhost:8757/ws?roomId=167920210669&types=chat,gift',
    );
  });
});
