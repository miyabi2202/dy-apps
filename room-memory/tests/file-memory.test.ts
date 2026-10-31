import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileMemory, parseEntries, type FileMemoryOptions } from '../src';

/** The memory of `/room` over files kept in a Map; the streamer is `s-1`. */
function setup(files: Record<string, string> = {}, options: Partial<FileMemoryOptions> = {}) {
  const store = new Map(Object.entries(files));
  const memory = fileMemory('/room', {
    read: (path) => {
      const text = store.get(path);
      if (text === undefined) throw new Error(`no ${path}`);
      return text;
    },
    write: (path, text) => void store.set(path, text),
    append: (path, text) => void store.set(path, (store.get(path) ?? '') + text),
    today: () => '2026-10-31',
    folderOf: (userId) => `folder-${userId}`,
    streamerId: () => 's-1',
    isPrivate: () => false,
    ...options,
  });
  return { memory, store };
}

const admin = { by: 'tool', userId: 's-1', admin: true } as const;
const viewer = { by: 'tool', userId: 'u-1', admin: false } as const;
const room = { scope: 'room' } as const;

test("the room's memory and each person's note are read from their files, empty when there are none", () => {
  const { memory } = setup({
    '/room/memory.md': '主播叫咿咿\n§\n爱唱周杰伦\n',
    '/room/folder-u-1/note.md': '喜欢被叫阿拂\n',
  });
  expect(memory.roomText()).toBe('主播叫咿咿\n§\n爱唱周杰伦\n');
  expect(memory.noteText('u-1')).toBe('喜欢被叫阿拂\n');
  expect(memory.noteText('u-2')).toBe('');
  expect(memory.entries(room)).toEqual([{ text: '主播叫咿咿' }, { text: '爱唱周杰伦' }]);
});

test('the limits: 4000 for the room, 2000 for the streamer, 1000 for anyone else', () => {
  const { memory } = setup();
  expect(memory.limitOf(room)).toBe(4000);
  expect(memory.limitOf({ scope: 'note', userId: 's-1' })).toBe(2000);
  expect(memory.limitOf({ scope: 'note', userId: 'u-1' })).toBe(1000);
});

test("a viewer's note is theirs alone, the room's is for admins, and a 私密 room has no viewer notes", () => {
  const add = { action: 'add', content: '爱听晴天' } as const;
  let isPrivate = false;
  const { memory, store } = setup({}, { isPrivate: () => isPrivate });
  const note = { scope: 'note', userId: 'u-1' } as const;

  expect(memory.change(note, add, viewer)).toEqual({ ok: true, used: 4, limit: 1000 });
  expect(store.get('/room/folder-u-1/note.md')).toBe('爱听晴天\n<!-- 2026-10-31 tool -->\n');
  expect(memory.noteText('u-1')).toBe('爱听晴天\n');
  expect(memory.change({ scope: 'note', userId: 'u-2' }, add, viewer)).toMatchObject({ ok: false });
  expect(memory.change(note, add, { by: 'tool', admin: false })).toMatchObject({ ok: false });

  expect(memory.change(room, add, viewer)).toEqual({
    ok: false,
    why: '直播间的记忆只有主播和机器人管理员能改',
  });
  expect(memory.change(room, add, admin)).toMatchObject({ ok: true });

  isPrivate = true;
  expect(memory.change(note, add, viewer)).toMatchObject({ ok: false });
  expect(memory.change({ scope: 'note', userId: 's-1' }, add, admin)).toMatchObject({ ok: true });
});

test('a change that does not fit says so, and writes nothing', () => {
  const { memory, store } = setup();
  const result = memory.change(
    { scope: 'note', userId: 'u-1' },
    { action: 'add', content: '字'.repeat(1001) },
    viewer,
  );
  expect(result.ok).toBe(false);
  expect(!result.ok && result.why).toContain('上限 1000 字');
  expect(store.size).toBe(0);
});

test('the chat may write anywhere; a change that cannot be made is skipped and the rest still are', () => {
  const { memory, store } = setup({ '/room/memory.md': '甲\n' });
  const done = memory.changeAll(
    room,
    [
      { action: 'remove', old: '没有这条' },
      { action: 'add', content: '乙' },
      { action: 'replace', old: '甲', content: '丙' },
    ],
    { by: 'chat' },
  );
  expect(done.made).toEqual([
    { action: 'add', content: '乙' },
    { action: 'replace', old: '甲', content: '丙' },
  ]);
  expect(done.skipped).toEqual([
    {
      change: { action: 'remove', old: '没有这条' },
      why: '没找到「没有这条」：照现在记着的原文抄一段',
    },
  ]);
  // Trailers don't count: `丙 § 乙` is five characters.
  expect(done).toMatchObject({ used: 5, limit: 4000 });
  expect(store.get('/room/memory.md')).toBe(
    '丙\n<!-- 2026-10-31 chat -->\n§\n乙\n<!-- 2026-10-31 chat -->\n',
  );
});

test('a hand edit applies at once: the file is read on every use', () => {
  const { memory, store } = setup({ '/room/memory.md': '甲\n' });
  store.set('/room/memory.md', '乙\n');
  expect(memory.roomText()).toBe('乙\n');
});

test('an entry a replace or remove takes out is kept first, with its date, who changed it and when', () => {
  const { memory, store } = setup({
    '/room/memory.md': '甲\n<!-- 2026-10-01 tool -->\n§\n乙\n§\n丙\n',
    '/room/folder-u-1/note.md': '爱听晴天\n',
  });
  memory.changeAll(
    room,
    [
      { action: 'replace', old: '甲', content: '甲二' },
      { action: 'remove', old: '乙' },
      { action: 'add', content: '丁' },
    ],
    { by: 'chat' },
  );
  expect(store.get('/room/memory/archive.md')).toBe(
    '甲\n<!-- 写于 2026-10-01 tool；2026-10-31 chat 改掉 -->\n§\n乙\n<!-- 写于 没有日期；2026-10-31 chat 删掉 -->\n§\n',
  );
  expect(memory.roomText()).toBe('甲二\n§\n丙\n§\n丁\n');
  expect(memory.entries(room)).toEqual([
    { text: '甲二', at: '2026-10-31', by: 'chat' },
    { text: '丙' },
    { text: '丁', at: '2026-10-31', by: 'chat' },
  ]);

  // A person's archive sits next to their note, outside the folder Claude may read.
  memory.change({ scope: 'note', userId: 'u-1' }, { action: 'remove', old: '晴天' }, viewer);
  expect(store.get('/room/folder-u-1/note-archive.md')).toBe(
    '爱听晴天\n<!-- 写于 没有日期；2026-10-31 tool 删掉 -->\n§\n',
  );
  expect(memory.readDir()).toBe('/room/memory');
});

test('a change that is not made leaves no archive entry, and an add never does', () => {
  const { memory, store } = setup({ '/room/memory.md': '甲\n' });
  memory.change(room, { action: 'remove', old: '甲' }, viewer);
  memory.change(room, { action: 'add', content: '乙' }, admin);
  expect([...store.keys()]).toEqual(['/room/memory.md']);
});

test('the live memory.md from before dates reads as a prompt exactly as it did, and new entries get dates', () => {
  const text = readFileSync(join(__dirname, 'fixtures', 'memory-before-dates.md'), 'utf8');
  const { memory, store } = setup({ '/room/memory.md': text });
  expect(memory.roomText()).toBe(text);
  memory.change(room, { action: 'add', content: '周五不播' }, admin);
  // Untouched entries stay as they were, undated.
  expect(memory.entries(room).map((entry) => entry.text)).toEqual([
    ...parseEntries(text).map((entry) => entry.text),
    '周五不播',
  ]);
  expect(store.get('/room/memory.md')).toContain('周五不播\n<!-- 2026-10-31 tool -->');
  expect(memory.entries(room).filter((entry) => entry.at)).toHaveLength(1);
});
