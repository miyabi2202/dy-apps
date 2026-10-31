import { ToolRunner } from '../../../src/app/tools/tool-runner';
import type { BotTool, ToolCommand, ToolContext } from '../../../src/core/tools/bot-tool';
import type { IncomingChat } from '../../../src/core/chat/room-events';
import { fakeRoom } from '../../support/fake-room';
import { fakeOutbox, silentLog } from '../../support/fakes';

/** A tool with one `/` command, whose `say` makes the reply from what the tool answered. */
function tool(
  name: string,
  command: string,
  options: {
    adminOnly?: boolean;
    parse?: ToolCommand['parse'];
    call?: BotTool['call'];
    say?: (text: string) => string;
  } = {},
): BotTool {
  return {
    name,
    description: '',
    inputSchema: {},
    adminOnly: options.adminOnly,
    commands: [
      {
        name: command,
        parse: options.parse ?? (() => ({ args: {} })),
        say: (result) => (options.say ?? ((text) => text))(result.text),
      },
    ],
    call: options.call ?? (() => Promise.resolve({ text: '好了' })),
  };
}

const chat = (nickname: string, content: string, userId = `u-${nickname}`): IncomingChat => ({
  ts: 0,
  userId,
  nickname,
  content,
  mentions: [],
});

function setup(tools: BotTool[], admins: string[] = [], logs: [string, object | undefined][] = []) {
  const { outbox, sent } = fakeOutbox();
  const runner = new ToolRunner({
    tools: () => tools,
    outbox,
    room: fakeRoom(),
    log: { ...silentLog, info: (message, meta) => void logs.push([message, meta]) },
    isAdmin: (userId) => userId !== undefined && admins.includes(userId),
    adminNames: '雅',
    now: (() => {
      let now = 1000;
      return () => (now += 40);
    })(),
  });
  /** Types `/name args` for `nickname`. */
  const type = async (nickname: string, name: string, args = '') => {
    const asker = chat(nickname, `/${name} ${args}`.trim());
    runner.run(asker, { name, args }, admins.includes(asker.userId ?? ''));
    await runner.idle();
    await outbox.idle();
  };
  return { type, sent, logs };
}

test('a bad argument is answered with how to use the command, without calling the tool', async () => {
  const calls: unknown[] = [];
  const point = tool('request_song', '点歌', {
    parse: (args) => (args ? { args: { title: args } } : { usage: '要写歌名，用法：/点歌 晴天' }),
    call: (args) => {
      calls.push(args);
      return Promise.resolve({ text: '已点歌' });
    },
  });
  const { type, sent } = setup([point]);
  await type('阿明', '点歌');
  await type('阿明', '点歌', '晴天');

  expect(calls).toEqual([{ title: '晴天' }]);
  expect(sent).toEqual(['@阿明 要写歌名，用法：/点歌 晴天', '@阿明 已点歌']);
});

test('anyone can run a public command, and only an admin an admin-only one', async () => {
  const ran: string[] = [];
  const run = (name: string) => () => {
    ran.push(name);
    return Promise.resolve({ text: `${name}好了` });
  };
  const { type, sent } = setup(
    [
      tool('request_song', '点歌', { call: run('点歌') }),
      tool('clear_queue', '清空', { adminOnly: true, call: run('清空') }),
    ],
    ['u-管理'],
  );
  await type('阿明', '点歌');
  await type('阿明', '清空');
  await type('管理', '清空');

  expect(ran).toEqual(['点歌', '清空']);
  expect(sent).toEqual([
    '@阿明 点歌好了',
    '@阿明 你无权调用「清空」指令，只有主播和雅才可以',
    '@管理 清空好了',
  ]);
});

test('a name nobody has is answered with the names they may use', async () => {
  const { type, sent } = setup(
    [
      tool('request_song', '点歌', {}),
      tool('clear_queue', '清空', { adminOnly: true }),
      tool('set_screenshots', '截图', { adminOnly: true }),
    ],
    ['u-管理'],
  );
  await type('阿明', '删库');
  await type('管理', '删库');

  expect(sent).toEqual([
    '@阿明 没有指令「删库」，可用的有：点歌',
    '@管理 没有指令「删库」，可用的有：点歌、清空、截图',
  ]);
});

test('a tool with nothing to say says nothing, and an error result is said as it is', async () => {
  const { type, sent } = setup([
    tool('mute', '静音', { say: () => '' }),
    tool('listen', '听', { call: () => Promise.resolve({ text: '现在听不了', isError: true }) }),
  ]);
  await type('管理', '静音');
  await type('管理', '听');

  expect(sent).toEqual(['@管理 现在听不了']);
});

test('a tool that throws is reported, and the others go on', async () => {
  const { type, sent } = setup([
    tool('broken', '坏', { call: () => Promise.reject(new Error('boom')) }),
    tool('fine', '好', {}),
  ]);
  await type('阿明', '坏');
  await type('阿明', '好');

  expect(sent).toEqual(['@阿明 指令「坏」出错了，没有完成', '@阿明 好了']);
});

test('calls the tool as a direct command, with who asked, and logs it with how long it took', async () => {
  const contexts: ToolContext[] = [];
  const { type, logs } = setup(
    [
      tool('request_song', '点歌', {
        parse: (args) => ({ args: { title: args } }),
        call: (_args, context) => {
          contexts.push(context);
          return Promise.resolve({ text: '已点歌' });
        },
      }),
    ],
    ['u-阿明'],
  );
  await type('阿明', '点歌', '晴天');

  expect(contexts).toEqual([
    { asker: '阿明', userId: 'u-阿明', question: '/点歌 晴天', admin: true, direct: true },
  ]);
  expect(logs.find(([message]) => message === 'command')?.[1]).toEqual({
    asker: '阿明',
    userId: 'u-阿明',
    name: '点歌',
    args: { title: '晴天' },
    ok: true,
    ms: 40,
  });
});

test("a result that says something itself (too few diamonds) is the reply, not the command's own", async () => {
  const heart = tool('send_heart', '小心心', {
    call: () => Promise.resolve({ text: '{"sent":false}', silent: true, say: '钻石不够送小心心' }),
    say: () => '',
  });
  const { type, sent } = setup([heart]);
  await type('阿明', '小心心');

  expect(sent).toEqual(['@阿明 钻石不够送小心心']);
});
