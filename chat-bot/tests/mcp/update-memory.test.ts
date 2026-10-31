import type { Memory } from '../../src/app/ports';
import { updateMemoryTool } from '../../src/mcp/update-memory';

const silentLog = { debug() {}, info() {}, warn() {}, error() {} };

/** The tool over memory kept in `store`, in a room whose streamer is `s-1`. */
function setup({ isPrivate = false } = {}) {
  const store = { room: '', notes: {} as Record<string, string> };
  const memory: Memory = {
    room: () => store.room,
    setRoom: (text) => (store.room = text),
    note: (userId) => store.notes[userId] ?? '',
    setNote: (userId, text) => (store.notes[userId] = text),
  };
  const tool = updateMemoryTool({
    memory,
    streamerId: () => 's-1',
    isPrivate: () => isPrivate,
    log: silentLog,
  });
  return { store, tool };
}

test("a note goes to whoever asked, and nobody else's", async () => {
  const { store, tool } = setup();
  const result = await tool.call(
    { scope: 'note', action: 'add', content: '喜欢被叫阿拂' },
    { asker: '阿拂', userId: 'u-1', question: '以后叫我阿拂' },
  );
  expect(JSON.parse(result.text)).toMatchObject({ ok: true, scope: 'note', limit: 1000 });
  expect(store.notes).toEqual({ 'u-1': '喜欢被叫阿拂\n' });

  const nobody = await tool.call(
    { scope: 'note', action: 'add', content: '是谁' },
    { asker: '某人', question: '' },
  );
  expect(nobody.isError).toBe(true);
});

test("the room's memory is only for the streamer and admins", async () => {
  const { store, tool } = setup();
  const args = { scope: 'room', action: 'add', content: '周五不播' };
  const viewer = await tool.call(args, { asker: '阿明', userId: 'u-2', question: '' });
  expect(viewer.isError).toBe(true);
  expect(store.room).toBe('');
  await tool.call(args, { asker: '咿咿', userId: 's-1', question: '', admin: true });
  expect(store.room).toBe('周五不播\n');
});

test("a 私密 room's viewers get no note, as they can't be told apart; its streamer still does", async () => {
  const { store, tool } = setup({ isPrivate: true });
  const args = { scope: 'note', action: 'add', content: '爱听晴天' };
  const viewer = await tool.call(args, { asker: '苦***', userId: '111111-苦***-31', question: '' });
  expect(viewer.isError).toBe(true);
  await tool.call(args, { asker: '咿咿', userId: 's-1', question: '', admin: true });
  expect(store.notes).toEqual({ 's-1': '爱听晴天\n' });
});

test('bad arguments say what is wrong', async () => {
  const { store, tool } = setup();
  const context = { asker: '阿明', userId: 'u-2', question: '' };
  expect((await tool.call({ scope: 'all', action: 'add', content: '甲' }, context)).isError).toBe(
    true,
  );
  expect((await tool.call({ scope: 'note', action: 'set', content: '甲' }, context)).isError).toBe(
    true,
  );
  expect(store.notes).toEqual({});
});

test("the streamer's note may hold 2000 characters, a viewer's 1000", async () => {
  const { store, tool } = setup();
  const args = { scope: 'note', action: 'add', content: '字'.repeat(1500) };
  const viewer = await tool.call(args, { asker: '阿明', userId: 'u-2', question: '' });
  expect(viewer.isError).toBe(true);
  const streamer = await tool.call(args, { asker: '咿咿', userId: 's-1', question: '' });
  expect(JSON.parse(streamer.text)).toMatchObject({ ok: true, used: 1500, limit: 2000 });
  expect(store.notes['s-1']).toBe(`${'字'.repeat(1500)}\n`);
});
