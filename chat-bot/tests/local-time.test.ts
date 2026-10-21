import { clock, localDate, localDateTime, timeZoneName } from '../src/core/local-time';

// 2026-10-21 00:47:38 UTC: 08:47 in Beijing, 11:47 in Sydney, still the 20th in New York.
const ms = Date.UTC(2026, 9, 21, 0, 47, 38);

test('times are shown in the room time zone, or the machine one when none is given', () => {
  expect(localDateTime(ms, 'Asia/Shanghai')).toBe('2026-10-21 08:47:38');
  expect(clock(ms, 'Australia/Sydney')).toBe('11:47:38');
  expect(localDate(ms, 'America/New_York')).toBe('2026-10-20 星期二');
  expect(localDate(ms, 'Asia/Shanghai')).toBe('2026-10-21 星期三');
  // The tests run in UTC.
  expect(localDateTime(ms)).toBe('2026-10-21 00:47:38');
});

test('a prompt calls Beijing time 北京时间, and other zones by name', () => {
  expect(timeZoneName('Asia/Shanghai')).toBe('北京时间');
  expect(timeZoneName('Asia/Tokyo')).toBe('Asia/Tokyo 时间');
});
