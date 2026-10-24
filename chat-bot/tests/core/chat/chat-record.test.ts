import {
  chatRecord,
  formatRecord,
  singingRecord,
  speechRecord,
} from '../../../src/core/chat/chat-record';

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

test('a sung line is whose the speech service took it for, with its voice and how close', () => {
  const sung = (extra: object) =>
    formatRecord(
      singingRecord({
        start: at - 3000,
        end: at,
        text: 'SUMMERTIME SADNESS',
        speech: 0.05,
        ...extra,
      }),
      at,
      'Asia/Shanghai',
    );
  expect(sung({ speaker: 2, host: true, voice: 0.83 })).toBe(
    '2026-10-21 16:00:00+08:00 [主播|声2|0.83](sing) SUMMERTIME SADNESS',
  );
  // A voice heard first has no closeness yet.
  expect(sung({ speaker: 3, host: false })).toBe(
    '2026-10-21 16:00:00+08:00 [连线|声3](sing) SUMMERTIME SADNESS',
  );
  // Too short for a voiceprint: the streamer's, untagged.
  expect(sung({})).toBe('2026-10-21 16:00:00+08:00 [主播](sing) SUMMERTIME SADNESS');
});

test("a recording playing is the streamer's, marked play, with what Shazam found in sing.txt", () => {
  const played = {
    start: at - 3000,
    end: at,
    text: '心の中に花を咲かそよ',
    speech: 0.05,
    speaker: 3,
    host: false,
    voice: 0.71,
    played: { title: '花', artist: '夏川りみ' },
  };
  expect(formatRecord(speechRecord(played), at, 'Asia/Shanghai')).toBe(
    '2026-10-21 16:00:00+08:00 [主播](play) 心の中に花を咲かそよ',
  );
  expect(formatRecord(singingRecord(played), at, 'Asia/Shanghai')).toBe(
    '2026-10-21 16:00:00+08:00 [连线|声3|0.71|放 花 / 夏川りみ](play) 心の中に花を咲かそよ',
  );
});
