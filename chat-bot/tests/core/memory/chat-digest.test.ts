import {
  chattersOf,
  digestText,
  memoryChangesOf,
  parseRecordLine,
  summaryOf,
} from '../../../src/core/memory/chat-digest';

test('a record line reads back as its time, sender, user id, type and text', () => {
  expect(
    parseRecordLine(
      '2026-10-21 16:32:46+08:00 [阿拂#103094206072|V|灯牌16|财富34](chat) 那发给我康康？',
    ),
  ).toEqual({
    ms: Date.parse('2026-10-21T16:32:46+08:00'),
    stamp: '2026-10-21 16:32:46+08:00',
    sender: '阿拂',
    userId: '103094206072',
    type: 'chat',
    text: '那发给我康康？',
  });
  expect(parseRecordLine('2026-10-21 16:32:50+08:00 [主播](speech) 大家好')).toMatchObject({
    sender: '主播',
    type: 'speech',
    text: '大家好',
  });
  expect(
    parseRecordLine('2026-10-21 16:32:50+08:00 [主播](speech) 大家好')!.userId,
  ).toBeUndefined();
  // A nickname with # and ] in it, and a 私密 viewer's id.
  expect(
    parseRecordLine('2026-10-21 16:33:00+08:00 [#1]猫#111111-苦***-31|财富31](chat) 好'),
  ).toMatchObject({
    sender: '#1]猫',
    userId: '111111-苦***-31',
  });
  expect(parseRecordLine('不是记录')).toBeNull();
});

test('chatters are the viewers who chatted enough, most first, without the bot or the streamer', () => {
  const line = (userId: string, sender: string, type = 'chat') => ({
    ms: 0,
    stamp: '',
    sender,
    userId,
    type,
    text: '',
  });
  const lines = [
    line('a', '甲'),
    line('b', '乙'),
    line('a', '甲甲'),
    line('b', '乙'),
    line('b', '乙'),
    line('a', '甲', 'gift'),
    line('bot', '机器人'),
    line('bot', '机器人'),
  ];
  const chatters = chattersOf(lines, { minChats: 2, exclude: new Set(['bot']) });
  expect(chatters.map((c) => [c.userId, c.nickname, c.lines.length])).toEqual([
    ['b', '乙', 3],
    ['a', '甲甲', 2],
  ]);
});

test("the digest keeps the latest lines that fit, cut short, without what's sung", () => {
  const lines = ['一二三四五', '唱的歌词', '六七八'].map((text, i) => ({
    ms: i,
    stamp: `2026-10-21 16:3${i}:00+08:00`,
    sender: '主播',
    type: i === 1 ? 'sing' : 'speech',
    text,
  }));
  expect(digestText(lines, { lineChars: 3, maxChars: 100 })).toBe(
    '16:30:00 主播(speech) 一二三\n16:32:00 主播(speech) 六七八',
  );
  expect(digestText(lines, { maxChars: 25 })).toBe('16:32:00 主播(speech) 六七八');
});

test("the model's changes are read as far as they're whole", () => {
  expect(
    memoryChangesOf([
      { action: 'add', content: '甲', old: '' },
      { action: 'replace', content: '乙', old: '甲' },
      { action: 'remove', content: '', old: '乙' },
      { action: 'set', content: '丙', old: '' },
      { action: 'add', content: 1 },
      null,
    ]),
  ).toEqual([
    { action: 'add', content: '甲' },
    { action: 'replace', old: '甲', content: '乙' },
    { action: 'remove', old: '乙' },
  ]);
  expect(memoryChangesOf('no')).toEqual([]);
});

test("a summary is one line of text, cut at 600 characters, and nothing when it isn't text", () => {
  expect(summaryOf(' 唱了晴天。\n聊了稻香 ')).toBe('唱了晴天。 聊了稻香');
  expect([...summaryOf('字'.repeat(700))]).toHaveLength(600);
  expect(summaryOf(undefined)).toBe('');
  expect(summaryOf(3)).toBe('');
});
