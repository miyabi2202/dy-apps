import { relevanceRequest, roomLines } from '../src/core/relevance';

test('one list of the room, with what the streamer read out marked, and only what may be about the bot to judge', () => {
  const lines = roomLines(
    [
      { ts: 1000, nickname: '阿明', content: '这机器人好笨啊' },
      { ts: 2000, nickname: '小助手', content: '@阿明 我才不笨' },
      { ts: 3000, nickname: '小红', content: '@小助手 你几岁' },
    ],
    [
      { start: 3000, end: 4000, text: '这机器人好笨啊哈哈哈', speech: 0.8 },
      { start: 4000, end: 5000, text: '我才不笨', speech: 0.8 },
      { start: 5000, end: 6000, text: '天青色等烟雨', speech: 0.05 },
    ],
    '小助手',
  );

  expect(lines.map(({ who, text, candidate }) => [who, text, candidate])).toEqual([
    ['阿明', '这机器人好笨啊', true],
    ['小助手', '@阿明 我才不笨', false],
    ['小红', '@小助手 你几岁', false],
    ['主播', '（念了阿明的弹幕）哈哈哈', true],
    // 我才不笨, the bot's own reply read out, is gone.
    ['主播', '（唱）天青色等烟雨', false],
  ]);
  const { state, questions } = relevanceRequest(
    lines.slice(0, 3),
    lines.slice(3, 4),
    '小助手',
    '一只猫',
  );
  expect(state).toContain('它的人设：一只猫。');
  expect(state).toMatch(/新内容：\n\(1\) \d\d:\d\d:04 \[主播\] （念了阿明的弹幕）哈哈哈$/);
  expect(Object.keys(questions)).toEqual(['q1']);
});
