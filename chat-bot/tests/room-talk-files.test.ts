import { botTalkFile, userTalkFiles } from '../src/adapters/room-talk-files';

/** Files kept in memory, by path. */
function memoryFiles() {
  const files = new Map<string, string>();
  return {
    files,
    append: (path: string, text: string) => files.set(path, (files.get(path) ?? '') + text),
    read: (path: string) => {
      const text = files.get(path);
      if (text === undefined) throw new Error('ENOENT');
      return text;
    },
  };
}

const now = () => Date.UTC(2026, 9, 17, 15, 0, 0);

test('keeps what the bot said one line each, and gives back only the latest', () => {
  const { files, append, read } = memoryFiles();
  const talk = botTalkFile('/r/bot_talk.txt', { keep: 2, now, append, read });
  expect(talk.recent()).toBe('');
  for (const text of ['一', '二\n换行', '三']) talk.add(text);

  expect(files.get('/r/bot_talk.txt')).toBe(
    '2026-10-17 15:00:00 一\n2026-10-17 15:00:00 二 换行\n2026-10-17 15:00:00 三\n',
  );
  expect(talk.recent()).toBe('2026-10-17 15:00:00 二 换行\n2026-10-17 15:00:00 三');
});

test("keeps each viewer's exchanges in their own file", () => {
  const { files, append, read } = memoryFiles();
  const talk = userTalkFiles('/r/users', { now, append, read });
  talk.add('123', { nickname: '阿明', question: '在吗', answer: '@阿明 在呢' });

  expect([...files.keys()]).toEqual(['/r/users/123.txt']);
  expect(talk.recent('123')).toBe(
    '2026-10-17 15:00:00 阿明问：在吗\n2026-10-17 15:00:00 你答：@阿明 在呢',
  );
  expect(talk.recent('456')).toBe('');
});
