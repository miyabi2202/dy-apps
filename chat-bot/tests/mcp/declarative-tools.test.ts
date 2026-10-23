import type { DefinedTool, ToolContext } from '../../src/app/ports';
import type { Mention } from '../../src/app/replies/mention-answerer';
import { declarativeTools } from '../../src/mcp/declarative-tools';
import { fakeRoom } from '../support/fake-room';
import { ChatHistory } from '../../src/core/chat/chat-history';
import { NOW } from '../support/fakes';

const CAN_SING: DefinedTool = {
  name: 'can_sing',
  description: '主播会唱xxx吗',
  guidance: () => '歌单：晴天',
  listen: {
    when: '在问主播会不会唱某首歌',
    trigger: /会唱/,
    mentioned: (text) => (text.includes('晴天') ? '晴天' : null),
  },
};

const FIXED: DefinedTool = {
  name: 'wants_topic',
  description: '点名让主播讲某个题',
  fixedReply: '宝宝，要开会员哦',
  except: [{ badge: 'V' }, { badge: 'V年' }],
};

const ADMIN_ONLY: DefinedTool = {
  name: 'only_admin',
  description: '只有管理员能叫',
  guidance: () => '说明',
  adminOnly: true,
};

const context: ToolContext = { asker: '阿明', userId: 'u-阿明', question: '主播会唱晴天吗' };

function setup(
  options: {
    definitions?: readonly DefinedTool[];
    enabled?: string[];
    builtIn?: string[];
    streamer?: { uid: string } | null;
  } = {},
) {
  const said: Mention[] = [];
  const logged: [string, string][] = [];
  let definitions = options.definitions ?? [CAN_SING, FIXED, ADMIN_ONLY];
  let enabled = options.enabled ?? ['can_sing', 'wants_topic', 'only_admin'];
  const history = new ChatHistory(100);
  history.add({ ts: NOW, nickname: '小红', userId: 'u-小红', content: '主播好' });
  const tools = declarativeTools({
    definitions: () => definitions,
    enabled: () => enabled,
    say: (mention) => void said.push(mention),
    room: fakeRoom({ history }),
    streamer: () => options.streamer ?? null,
    builtInNames: () => options.builtIn ?? [],
    log: {
      debug() {},
      info: (message) => void logged.push(['info', message]),
      warn: (message, meta) => void logged.push(['warn', `${message} ${JSON.stringify(meta)}`]),
      error() {},
    },
  });
  return {
    tools,
    said,
    logged,
    setDefinitions: (next: readonly DefinedTool[]) => (definitions = next),
    setEnabled: (next: string[]) => (enabled = next),
  };
}

const named = (tools: ReturnType<ReturnType<typeof setup>['tools']>, name: string) =>
  tools.find((tool) => tool.name === name)!;

test("one tool for each enabled name, in the list's order, named and described by its definition", () => {
  const { tools } = setup({ enabled: ['wants_topic', 'can_sing', 'only_admin'] });
  const built = tools();
  expect(built.map((tool) => tool.name)).toEqual(['wants_topic', 'can_sing', 'only_admin']);
  expect(named(built, 'can_sing').description).toBe('主播会唱xxx吗');
  expect(named(built, 'only_admin').description).toContain('只有管理员能叫');
  expect(named(built, 'only_admin').adminOnly).toBe(true);
  expect(named(built, 'can_sing').adminOnly).toBeUndefined();
  expect(named(built, 'can_sing').listen).toBe(CAN_SING.listen);
  // Typed commands are the built-in tools' alone.
  expect(built.every((tool) => tool.commands === undefined)).toBe(true);
  expect(setup({ enabled: [] }).tools()).toEqual([]);
});

test('a guidance tool returns its guidance and sends nothing; one that cannot be read is an error result', async () => {
  const { tools, said } = setup({
    definitions: [CAN_SING, { ...CAN_SING, name: 'broken', guidance: () => '' }],
    enabled: ['can_sing', 'broken'],
  });
  expect(await named(tools(), 'can_sing').call({}, context)).toEqual({ text: '歌单：晴天' });
  const broken = await named(tools(), 'broken').call({}, context);
  expect(broken.isError).toBe(true);
  expect(said).toEqual([]);
});

test('a fixed reply goes out through say, with the chat and the asker, and Claude is told it was sent', async () => {
  const { tools, said, logged } = setup();
  const result = await named(tools(), 'wants_topic').call({}, context);
  expect(JSON.parse(result.text)).toEqual({ sent: true });
  expect(said).toEqual([
    {
      asker: '阿明',
      userId: 'u-阿明',
      question: '主播会唱晴天吗',
      history: [{ ts: NOW, nickname: '小红', userId: 'u-小红', content: '主播好' }],
      fixedReply: '宝宝，要开会员哦',
    },
  ]);
  expect(logged).toContainEqual(['info', 'fixed reply']);
});

describe('the user filter', () => {
  const run = async (
    viewer: ToolContext['viewer'],
    extra: Partial<ToolContext> = {},
    streamer: { uid: string } | null = null,
  ) => {
    const { tools, said } = setup({
      definitions: [
        FIXED,
        { ...FIXED, name: 'members', except: undefined, only: [{ badge: 'V' }] },
        { ...FIXED, name: 'fans', except: undefined, only: [{ fansLevel: 10 }] },
        { ...FIXED, name: 'rich', except: undefined, only: [{ payLevel: 30 }, { admin: true }] },
      ],
      enabled: ['wants_topic', 'members', 'fans', 'rich'],
      streamer,
    });
    const skipped: Record<string, boolean> = {};
    for (const tool of tools()) {
      const result = await tool.call({}, { ...context, ...extra, viewer });
      skipped[tool.name] = (JSON.parse(result.text) as { skipped?: boolean }).skipped === true;
    }
    return { skipped, said };
  };

  test('except leaves out the viewers it names, only keeps the ones it names', async () => {
    const member = await run({ admin: false, badges: ['V年'] });
    expect(member.skipped).toEqual({ wants_topic: true, members: true, fans: true, rich: true });
    const plain = await run({ admin: false, badges: ['V'] });
    expect(plain.skipped).toMatchObject({ wants_topic: true, members: false });
    // A skipped tool sends nothing.
    expect(member.said).toEqual([]);
    expect((await run({ admin: false })).skipped.wants_topic).toBe(false);
  });

  test("a fan club counts when it's the streamer's", async () => {
    const club = (anchorId?: string) => ({ admin: false, fansClub: { level: 12, anchorId } });
    expect((await run(club('s1'), {}, { uid: 's1' })).skipped.fans).toBe(false);
    expect((await run(club('s2'), {}, { uid: 's1' })).skipped.fans).toBe(true);
    expect((await run(club(), {}, { uid: 's1' })).skipped.fans).toBe(false);
  });

  test('wealth level or admin, a 私密 viewer by the id given, and without a viewer only the admin flag', async () => {
    expect((await run({ admin: false, payLevel: 31 })).skipped.rich).toBe(false);
    expect((await run({ admin: true })).skipped.rich).toBe(false);
    const secret = { userId: '111111-苦***-31', asker: '苦***' };
    expect((await run({ admin: false, payLevel: 31 }, secret)).skipped.rich).toBe(false);
    expect((await run(undefined, { admin: true })).skipped.rich).toBe(false);
    expect((await run(undefined, { admin: false })).skipped.rich).toBe(true);
  });
});

test('a name with no definition, and a built-in tool’s name, are warned about and skipped; a name twice is one tool', () => {
  const { tools, logged } = setup({
    enabled: ['nope', 'can_sing', 'wants_topic', 'can_sing'],
    builtIn: ['wants_topic'],
  });
  expect(tools().map((tool) => tool.name)).toEqual(['can_sing']);
  expect(logged).toEqual([
    ['warn', 'room_config.json lists a tool there is no definition for {"name":"nope"}'],
    ['warn', 'skipping a tool: its name is a built-in tool’s {"name":"wants_topic"}'],
  ]);
});

test('the tools are built again when the list or the definitions change, and not otherwise', () => {
  const { tools, setEnabled, setDefinitions } = setup();
  const first = tools();
  expect(tools()).toBe(first);
  setEnabled(['can_sing']);
  const listed = tools();
  expect(listed).not.toBe(first);
  expect(listed.map((tool) => tool.name)).toEqual(['can_sing']);
  expect(tools()).toBe(listed);
  setDefinitions([{ ...CAN_SING, description: '改了' }]);
  expect(tools()[0]!.description).toBe('改了');
});
