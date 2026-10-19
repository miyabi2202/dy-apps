import type { RoomLine } from '../src/core/relevance';
import { parseReplyPick, pickLines } from '../src/core/reply-pick';

test('reads the picks, and rejects what is not the schema', () => {
  expect(parseReplyPick('{"picks":[{"line":2,"confidence":0.7}]}')).toEqual([
    { line: 2, confidence: 0.7, command: '' },
  ]);
  expect(parseReplyPick('{"picks":[{"line":1,"confidence":0.9,"command":"can-sing"}]}')).toEqual([
    { line: 1, confidence: 0.9, command: 'can-sing' },
  ]);
  expect(parseReplyPick('{"picks":[]}')).toEqual([]);

  expect(parseReplyPick('机器人你好')).toBeNull();
  expect(parseReplyPick('{}')).toBeNull();
  expect(parseReplyPick('{"picks":"none"}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1.5,"confidence":0.7}]}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1,"confidence":"high"}]}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1}]}')).toBeNull();
});

test('numbers only the lines that may be answered, stars the ones about the bot, indents the rest', () => {
  const line = (who: string, text: string, ts = 20_000): RoomLine => ({
    ts,
    who,
    text,
    candidate: true,
  });
  const lines = [line('阿明', '今晚吃火锅'), line('小红', '机器人你几岁'), line('小蓝', '哈哈')];
  const { text, numbered } = pickLines(lines, (l) => l.who !== '阿明', new Set([lines[1]!]));

  expect(numbered).toEqual([lines[1], lines[2]]);
  expect(text).toBe(
    [
      '     00:00:20 [阿明] 今晚吃火锅',
      '(1)★ 00:00:20 [小红] 机器人你几岁',
      '(2)  00:00:20 [小蓝] 哈哈',
    ].join('\n'),
  );
});
