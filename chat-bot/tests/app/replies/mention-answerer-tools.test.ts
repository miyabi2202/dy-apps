import { MentionAnswerer, type Mention } from '../../../src/app/replies/mention-answerer';
import type { Admins, BotTools, Question, ToolContext, ToolSession } from '../../../src/app/ports';
import { fakeRoom } from '../../support/fake-room';
import { NOW, fakeOutbox, silentLog } from '../../support/fakes';

/** An answerer with a fake tools server; `answer` is what Claude says, `use` the tools it called meanwhile. */
function setup(
  options: {
    answer?: string;
    use?: string[];
    fail?: boolean;
    admins?: Admins;
  } = {},
) {
  const { outbox, sent } = fakeOutbox();
  const questions: Question[] = [];
  const opened: ToolContext[] = [];
  const events: string[] = [];
  const used: string[] = [];
  const tools: BotTools = {
    open: (context) => {
      opened.push(context);
      events.push('open');
      const session: ToolSession = {
        access: { url: 'http://127.0.0.1:1/mcp', token: 't', tools: ['identify_song'] },
        used: () => [...used],
        replaces: (command) => used.includes('identify_song') && command === '识歌',
        close: () => void events.push('close'),
      };
      return session;
    },
  };
  const answerer = new MentionAnswerer({
    ask: (question) => {
      questions.push(question);
      used.push(...(options.use ?? []));
      return options.fail
        ? Promise.reject(new Error('claude failed'))
        : Promise.resolve(options.answer ?? JSON.stringify({ message: '你好呀' }));
    },
    outbox,
    room: fakeRoom({ now: () => NOW }),
    log: silentLog,
    promptTemplate: () => '{{question}}',
    tools,
    admins: options.admins,
  });
  const ask = async (mention: Partial<Mention> = {}) => {
    answerer.ask({ asker: '阿明', question: '在吗', history: [], ...mention });
    await answerer.idle();
    await outbox.idle();
  };
  return { ask, questions, opened, events, sent };
}

test('the usual prompt gets a tools session, with a longer limit, closed once answered', async () => {
  const { ask, questions, events } = setup();
  await ask();
  expect(questions[0]?.botTools).toEqual({
    url: 'http://127.0.0.1:1/mcp',
    token: 't',
    tools: ['identify_song'],
  });
  expect(questions[0]?.timeoutMs).toBe(300_000);
  expect(events).toEqual(['open', 'close']);
});

test('a command with its own prompt gets no tools', async () => {
  const { ask, questions, events } = setup({ answer: '答案' });
  await ask({ template: '{{question}}' });
  expect(questions[0]?.botTools).toBeUndefined();
  expect(questions[0]?.timeoutMs).toBeUndefined();
  expect(events).toEqual([]);
});

test('the session is closed when answering fails, and opened with a 私密 viewer as given', async () => {
  // A 私密 room: every viewer is 111111, so the bot keys them by 111111-<nickname>-<level>.
  const userId = '111111-苦***-31';
  const { ask, opened, events, sent } = setup({ fail: true });
  await ask({ asker: '苦***', userId, question: '这是什么歌' });

  expect(opened).toEqual([{ asker: '苦***', userId, question: '这是什么歌', admin: false }]);
  expect(events).toEqual(['open', 'close']);
  expect(sent).toEqual([]);
});

test('the session is told whether the asker is an admin', async () => {
  const { ask, opened } = setup({ admins: { has: (userId) => userId === 'u-雅' } });
  await ask({ asker: '雅', userId: 'u-雅' });
  await ask({ asker: '阿明', userId: 'u-阿明' });
  await ask({ asker: '无名' });
  expect(opened.map(({ admin }) => admin)).toEqual([true, false, false]);
});

test("a command_request for what Claude already did with a tool is ignored, and Claude's message is sent", async () => {
  let requested = 0;
  const { outbox, sent } = fakeOutbox();
  const tools: BotTools = {
    open: () => ({
      access: { url: 'u', token: 't', tools: ['identify_song'] },
      used: () => ['identify_song'],
      replaces: (command) => command === '识歌',
      close: () => {},
    }),
  };
  const answerer = new MentionAnswerer({
    ask: () =>
      Promise.resolve(
        JSON.stringify({ message: '是《晴天》哦', command_request: '识歌', command_args: '' }),
      ),
    outbox,
    room: fakeRoom({ now: () => NOW }),
    log: silentLog,
    promptTemplate: () => '{{question}}',
    tools,
    onCommandRequest: () => {
      requested++;
      return true;
    },
  });
  answerer.ask({ asker: '阿明', question: '什么歌', history: [] });
  await answerer.idle();
  await outbox.idle();

  expect(requested).toBe(0);
  expect(sent).toEqual(['@阿明 是《晴天》哦']);
});

test('without tool use the command is run as before', async () => {
  let requested: string[] = [];
  const { outbox, sent } = fakeOutbox();
  const answerer = new MentionAnswerer({
    ask: () =>
      Promise.resolve(JSON.stringify({ message: '', command_request: '识歌', command_args: '' })),
    outbox,
    room: fakeRoom({ now: () => NOW }),
    log: silentLog,
    promptTemplate: () => '{{question}}',
    tools: {
      open: () => ({
        access: { url: 'u', token: 't', tools: ['identify_song'] },
        used: () => [],
        replaces: () => false,
        close: () => {},
      }),
    },
    onCommandRequest: (_mention, name) => {
      requested = [...requested, name];
      return true;
    },
  });
  answerer.ask({ asker: '阿明', question: '什么歌', history: [] });
  await answerer.idle();

  expect(requested).toEqual(['识歌']);
  expect(sent).toEqual([]);
});
