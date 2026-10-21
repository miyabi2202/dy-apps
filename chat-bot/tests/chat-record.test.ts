import { chatRecord, formatRecord } from '../src/core/chat-record';

const at = Date.UTC(2026, 9, 21, 8, 0, 0);

test("a chat's sender comes with their member badge, fan club and wealth levels, when known", () => {
  const line = (extra: object) =>
    formatRecord(
      chatRecord({ ts: at, userId: '7', nickname: '阿明', content: '讲讲曲面积分', ...extra }),
      at,
      'Asia/Shanghai',
    );
  expect(
    line({ badges: ['粉丝团等级16级勋章', 'V年'], fansClub: { level: 16 }, payLevel: 36 }),
  ).toBe('2026-10-21 16:00:00+08:00 [阿明#7|V年|灯牌16|财富36](chat) 讲讲曲面积分');
  expect(line({ badges: ['V'] })).toBe('2026-10-21 16:00:00+08:00 [阿明#7|V](chat) 讲讲曲面积分');
  // Nothing known: as before.
  expect(line({})).toBe('2026-10-21 16:00:00+08:00 [阿明#7](chat) 讲讲曲面积分');
  // A 私密 viewer shows only the wealth level.
  expect(
    formatRecord(
      chatRecord({
        ts: at,
        userId: '111111-苦***-31',
        nickname: '苦***',
        content: '好',
        payLevel: 31,
      }),
      at,
      'Asia/Shanghai',
    ),
  ).toBe('2026-10-21 16:00:00+08:00 [苦***#111111-苦***-31|财富31](chat) 好');
});
