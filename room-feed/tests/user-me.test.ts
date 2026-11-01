import { isUserMe, readUserMe } from '../src/douyin/user-me';

describe('readUserMe', () => {
  it('reads the logged-in account, and that Douyin takes no login (20003)', () => {
    const me = { id_str: '7692586790687114297', nickname: '默认关闭', display_id: '28100824821' };
    expect(readUserMe({ status_code: 0, data: me })).toEqual({
      uid: '7692586790687114297',
      nickname: '默认关闭',
      displayId: '28100824821',
    });
    expect(readUserMe({ status_code: 20003, data: {} })).toBe('loggedOut');
  });

  it('is null for an answer that says neither', () => {
    expect(readUserMe({})).toBeNull();
    expect(readUserMe({ status_code: 0, data: {} })).toBeNull();
    expect(readUserMe({ status_code: 10011, data: { id_str: '1' } })).toBeNull();
  });
});

it('isUserMe knows the page asking who is logged in', () => {
  expect(isUserMe('https://live.douyin.com/webcast/user/me/?aid=6383')).toBe(true);
  expect(isUserMe('https://live.douyin.com/webcast/user/?aid=6383')).toBe(false);
});
