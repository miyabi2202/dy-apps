import { ChatLog } from '../src/chat-log';

test('writes one line per record, 100 to a file, named by the first record’s time', () => {
  const files = new Map<string, string>();
  let now = Date.UTC(2026, 9, 16, 8, 47, 20);
  const log = new ChatLog('/data/chat/1', {
    perFile: 2,
    now: () => (now += 1000),
    append: (path, text) => files.set(path, (files.get(path) ?? '') + text),
  });
  log.add({ type: 'speech', sender: '主播', text: '大家好\n今天讲吕布', emotion: 'HAPPY' });
  log.add({ type: 'chat', sender: '阿明', userId: 'u1', text: '主播好' });
  log.add({
    type: 'gift',
    sender: '雅',
    userId: 'u2',
    gift: { name: '人气票', count: 1, diamonds: 1 },
  });

  expect(Object.fromEntries(files)).toEqual({
    [`/data/chat/1/${Date.UTC(2026, 9, 16, 8, 47, 21)}.txt`]:
      '2026-10-16 08:47:21 [主播](speech)(HAPPY) 大家好 今天讲吕布\n' +
      '2026-10-16 08:47:22 [阿明#u1](chat) 主播好\n',
    [`/data/chat/1/${Date.UTC(2026, 9, 16, 8, 47, 23)}.txt`]:
      '2026-10-16 08:47:23 [雅#u2](gift) 送出 人气票×1（1钻）\n',
  });
});
