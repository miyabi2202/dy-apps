import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileMemory, type Change } from '../src';

/** A fixture's text. */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

/** The memory of `/room` over files kept in a Map, on 2026-10-31. */
function setup(files: Record<string, string>) {
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
    folderOf: (userId) => userId,
    streamerId: () => 's-1',
    isPrivate: () => false,
  });
  return { memory, store };
}

const room = { scope: 'room' } as const;
const chat = { by: 'chat' } as const;
const ONLY_EXTEND = '这条是主播或管理员写的，只能在后面补充，不能改写或删掉';

test('every change to the room memory that pnpm remember made so far (from the log) is still allowed', () => {
  const changes = JSON.parse(fixture('room-changes-from-the-log.json')) as Change[];
  expect(changes.map((change) => change.action)).toEqual([
    'replace',
    'add',
    'replace',
    'add',
    'add',
    'replace',
    'replace',
  ]);
  // The memory.md they were made to: today's, with each change taken back out (the log doesn't
  // keep the file, and it has been tidied by hand since, so a change it no longer holds has its
  // old text put back as an entry). None of it has a date: it all predates them.
  let before = fixture('memory-before-dates.md');
  for (const change of [...changes].reverse()) {
    if (change.action === 'add') before = before.replace(change.content, () => '');
    else if (change.action === 'replace' && before.includes(change.content)) {
      before = before.replace(change.content, () => change.old);
    } else if (change.action === 'replace' && !before.includes(change.old)) {
      before += `§\n${change.old}\n`;
    }
  }
  const { memory } = setup({ '/room/memory.md': before });
  const done = memory.changeAll(room, changes, chat);
  expect(done.skipped).toEqual([]);
  expect(done.made).toEqual(changes);
});

test('the chat may add to the room memory, and add to an entry the streamer or an admin wrote', () => {
  const { memory } = setup({
    '/room/memory.md': '主播叫咿咿\n§\n爱唱周杰伦。\n<!-- 2026-10-30 tool -->\n',
  });
  const done = memory.changeAll(
    room,
    [
      { action: 'add', content: '周五不播' },
      // Undated: from before dates, so written by hand or by an admin.
      { action: 'replace', old: '主播叫咿咿', content: '主播叫咿咿，外号 11' },
      // Dated by the tool (an admin): the old text stays, bar the full stop it ended with.
      { action: 'replace', old: '爱唱周杰伦。', content: '爱唱周杰伦，也爱林俊杰' },
    ],
    chat,
  );
  expect(done.skipped).toEqual([]);
  expect(memory.roomText()).toBe('主播叫咿咿，外号 11\n§\n爱唱周杰伦，也爱林俊杰\n§\n周五不播\n');
});

test('the chat may not rewrite or remove what the streamer or an admin wrote', () => {
  const text = '主播叫咿咿\n§\n爱唱周杰伦\n<!-- 2026-10-30 tool -->\n';
  const { memory, store } = setup({ '/room/memory.md': text });
  const done = memory.changeAll(
    room,
    [
      { action: 'replace', old: '主播叫咿咿', content: '主播叫阿拂' },
      { action: 'remove', old: '主播叫咿咿' },
      { action: 'replace', old: '周杰伦', content: '陈奕迅' },
      { action: 'remove', old: '周杰伦' },
      // Keeps the old text, but what's put before it turns it round.
      { action: 'replace', old: '爱唱周杰伦', content: '不爱唱周杰伦' },
    ],
    chat,
  );
  expect(done.made).toEqual([]);
  expect(done.skipped.map((skipped) => skipped.why)).toEqual(Array(5).fill(ONLY_EXTEND));
  expect(store.get('/room/memory.md')).toBe(text);
  expect([...store.keys()]).toEqual(['/room/memory.md']);
});

test("the chat may rewrite and remove what it wrote itself, and an entry it wrote and an admin then changed is the admin's", () => {
  const { memory } = setup({
    '/room/memory.md': '甲\n<!-- 2026-10-30 chat -->\n§\n乙\n<!-- 2026-10-30 chat -->\n',
  });
  const done = memory.changeAll(
    room,
    [
      { action: 'replace', old: '甲', content: '丙' },
      { action: 'remove', old: '乙' },
    ],
    chat,
  );
  expect(done.skipped).toEqual([]);
  expect(memory.roomText()).toBe('丙\n');

  memory.change(room, { action: 'replace', old: '丙', content: '丁' }, { by: 'tool', admin: true });
  expect(memory.change(room, { action: 'remove', old: '丁' }, chat)).toEqual({
    ok: false,
    why: ONLY_EXTEND,
  });
});

test("a change the chat could not make anyway says so, not that it isn't allowed, and a person's note is open to it", () => {
  const { memory } = setup({
    '/room/memory.md': '主播叫咿咿\n',
    '/room/u-1/note.md': '爱听晴天\n',
  });
  const missing = memory.change(room, { action: 'remove', old: '没有这条' }, chat);
  expect(missing).toMatchObject({ ok: false });
  expect(!missing.ok && missing.why).toContain('没找到');

  const note = { scope: 'note', userId: 'u-1' } as const;
  expect(
    memory.change(note, { action: 'replace', old: '晴天', content: '稻香' }, chat),
  ).toMatchObject({ ok: true });
  expect(memory.change(note, { action: 'remove', old: '稻香' }, chat)).toMatchObject({ ok: true });
});
