import { ChatLog } from '../src/chat-log';

test('writes records to a file per 100, named by the first record’s time', () => {
  const files = new Map<string, unknown[]>();
  let now = 1_000;
  const log = new ChatLog('/data/chat/1', {
    perFile: 2,
    now: () => now++,
    write: (path, value) => files.set(path, structuredClone(value as unknown[])),
  });
  log.add({ type: 'speech', sender: '主播', text: '大家好', emotion: 'HAPPY' });
  log.add({ type: 'chat', sender: '阿明', userId: 'u1', text: '主播好' });
  log.add({
    type: 'gift',
    sender: '阿明',
    userId: 'u1',
    gift: { name: '玫瑰', count: 3, diamonds: 3 },
  });

  expect([...files.keys()]).toEqual(['/data/chat/1/1000.json', '/data/chat/1/1002.json']);
  expect(files.get('/data/chat/1/1000.json')).toEqual([
    expect.objectContaining({
      ts: 1000,
      sender: '主播',
      type: 'speech',
      text: '大家好',
      emotion: 'HAPPY',
    }),
    expect.objectContaining({ ts: 1001, sender: '阿明', type: 'chat', text: '主播好' }),
  ]);
  expect(files.get('/data/chat/1/1002.json')).toEqual([
    expect.objectContaining({ type: 'gift', gift: { name: '玫瑰', count: 3, diamonds: 3 } }),
  ]);
});
