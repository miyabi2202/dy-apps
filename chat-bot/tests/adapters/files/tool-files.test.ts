import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { liveToolDefinitions, loadToolDefinitions } from '../../../src/adapters/files/tool-files';

const fakeLog = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

const CAN_SING = {
  name: 'can_sing',
  description: '主播会唱xxx吗',
  guidance: 'guidance.md',
  listen: { when: '在问会不会唱', trigger: '会唱', mentions: 'artifacts/songs.txt' },
};

/** A tools folder with can-sing, wants-topic, a broken one and an empty one, beside a room folder. */
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'tool-files-'));
  const toolsDir = join(root, 'tools');
  const roomDir = join(root, 'room');
  for (const folder of ['can-sing', 'wants-topic', 'broken', 'empty']) {
    mkdirSync(join(toolsDir, folder), { recursive: true });
  }
  mkdirSync(join(roomDir, 'artifacts'), { recursive: true });
  writeFileSync(join(toolsDir, 'can-sing', 'tool.json'), JSON.stringify(CAN_SING));
  writeFileSync(
    join(toolsDir, 'can-sing', 'guidance.md'),
    '{{file:artifacts/songs.txt}}{{file?:tools/can-sing/notes.md}}，{{streamerNames}}',
  );
  writeFileSync(
    join(toolsDir, 'wants-topic', 'tool.json'),
    JSON.stringify({ name: 'wants_topic', description: '点名讲题', fixedReply: '开会员哦' }),
  );
  writeFileSync(join(toolsDir, 'broken', 'tool.json'), '{ "name": ');
  writeFileSync(join(roomDir, 'artifacts', 'songs.txt'), '晴天｜周杰伦\n');
  return { toolsDir, roomDir };
}

test("loads the tools in folder order, a guidance read again on every call with the room's files and names filled in", () => {
  const { toolsDir, roomDir } = setup();
  const log = fakeLog();
  const tools = loadToolDefinitions(toolsDir, {
    roomDir,
    log,
    streamerNames: () => ['虾虾'],
  });
  expect(tools.map(({ name }) => name)).toEqual(['can_sing', 'wants_topic']);
  expect(log.warn.mock.calls.map(([message]: [string]) => message)).toEqual([
    'tool.json is not JSON',
    'a tool folder has no tool.json',
  ]);

  const [canSing, wantsTopic] = tools;
  // The optional notes aren't there yet: left out, and nothing warned.
  expect(canSing!.guidance!()).toBe('晴天｜周杰伦，虾虾');
  mkdirSync(join(roomDir, 'tools', 'can-sing'), { recursive: true });
  writeFileSync(join(roomDir, 'tools', 'can-sing', 'notes.md'), '备注\n');
  writeFileSync(join(roomDir, 'artifacts', 'songs.txt'), '稻香');
  expect(canSing!.guidance!()).toBe('稻香备注，虾虾');
  expect(log.warn).toHaveBeenCalledTimes(2);

  expect(wantsTopic).toMatchObject({ fixedReply: '开会员哦' });
  expect(wantsTopic!.guidance).toBeUndefined();
});

test("a tool listening to speech has its fixedReply as the listen's speechReply", () => {
  const { toolsDir, roomDir } = setup();
  writeFileSync(
    join(toolsDir, 'wants-topic', 'tool.json'),
    JSON.stringify({
      name: 'wants_topic',
      description: '扣 1',
      fixedReply: '1',
      listen: { trigger: '打一', speech: true },
    }),
  );
  const [, wantsTopic] = loadToolDefinitions(toolsDir, { roomDir, log: fakeLog() });
  expect(wantsTopic!.listen).toEqual({ trigger: /打一/, speechReply: '1' });
});

test("a tool's mentions file is read on each use, and a missing one mentions nothing", () => {
  const { toolsDir, roomDir } = setup();
  const [canSing] = loadToolDefinitions(toolsDir, {
    roomDir: join(roomDir, 'nowhere'),
    log: fakeLog(),
  });
  expect(canSing!.listen!.mentioned!('会唱晴天吗')).toBeNull();
  const [real] = loadToolDefinitions(toolsDir, { roomDir, log: fakeLog() });
  expect(real!.listen).toMatchObject({ when: '在问会不会唱', trigger: /会唱/ });
  expect(real!.listen!.mentioned!('会唱晴天吗')).toBe('晴天');
  writeFileSync(join(roomDir, 'artifacts', 'songs.txt'), '稻香');
  expect(real!.listen!.mentioned!('会唱晴天吗')).toBeNull();
});

test('a guidance file that cannot be read keeps the last text, with a warning', () => {
  const { toolsDir, roomDir } = setup();
  const log = fakeLog();
  const files = new Map<string, string>();
  const read = (path: string) => {
    const text = files.get(path);
    if (text === undefined) throw new Error('gone');
    return text;
  };
  files.set(join(toolsDir, 'can-sing', 'tool.json'), JSON.stringify(CAN_SING));
  files.set(join(toolsDir, 'can-sing', 'guidance.md'), '说明');
  const [tool] = loadToolDefinitions(toolsDir, {
    roomDir,
    log,
    read,
    folders: () => ['can-sing'],
  });
  expect(tool!.guidance!()).toBe('说明');
  files.delete(join(toolsDir, 'can-sing', 'guidance.md'));
  expect(tool!.guidance!()).toBe('说明');
  expect(log.warn).toHaveBeenCalledWith("could not read a tool's guidance", expect.anything());
});

test('a missing tools folder has no tools, and says so', () => {
  const log = fakeLog();
  expect(loadToolDefinitions(join(tmpdir(), 'no-such-tools-dir'), { roomDir: '.', log })).toEqual(
    [],
  );
  expect(log.warn).toHaveBeenCalledWith('no tool definitions folder', expect.anything());
});

test('the live tools are built again when a tool.json or the names change, and kept through one broken mid-edit', () => {
  const { toolsDir, roomDir } = setup();
  let names = ['茜茜'];
  const log = fakeLog();
  const tools = liveToolDefinitions(toolsDir, { roomDir, log, streamerNames: () => names });
  const first = tools();
  expect(first.map(({ name }) => name)).toEqual(['can_sing', 'wants_topic']);
  expect(tools()).toBe(first);

  names = ['虾虾'];
  const renamed = tools();
  expect(renamed).not.toBe(first);
  expect(tools()).toBe(renamed);

  const json = join(toolsDir, 'can-sing', 'tool.json');
  writeFileSync(json, JSON.stringify({ ...CAN_SING, adminOnly: true }));
  expect(tools().find(({ name }) => name === 'can_sing')!.adminOnly).toBe(true);

  const good = tools();
  const warns = log.warn.mock.calls.length;
  writeFileSync(json, '{ "name": ');
  expect(tools()).toBe(good);
  expect(tools()).toBe(good);
  expect(log.warn).toHaveBeenCalledTimes(warns + 1);

  writeFileSync(json, JSON.stringify(CAN_SING));
  expect(tools()).not.toBe(good);
});
