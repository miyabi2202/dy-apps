import { MentionAnswerer, type Mention } from '../../../src/app/replies/mention-answerer';
import type {
  Admins,
  BotTools,
  Question,
  ToolCall,
  ToolContext,
  ToolSession,
} from '../../../src/app/ports';
import { fakeRoom } from '../../support/fake-room';
import { NOW, fakeOutbox, silentLog } from '../../support/fakes';

/** An answerer with a fake tools server; `answer` is what Claude says, `use` the tools it called meanwhile. */
function setup(
  options: {
    answer?: string;
    use?: string[];
    fail?: boolean;
    admins?: Admins;
    calls?: ToolCall[];
    streamerId?: string;
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
        calls: () => options.calls ?? [],
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
    streamerId: () => options.streamerId,
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

test('the session is closed when answering fails, and opened with a 私密 viewer as given', async () => {
  // A 私密 room: every viewer is 111111, so the bot keys them by 111111-<nickname>-<level>.
  const userId = '111111-苦***-31';
  const { ask, opened, events, sent } = setup({ fail: true });
  await ask({ asker: '苦***', userId, question: '这是什么歌' });

  expect(opened).toEqual([{ asker: '苦***', userId, question: '这是什么歌', admin: false }]);
  expect(events).toEqual(['open', 'close']);
  expect(sent).toEqual([]);
});

test('after a tool with a silent result (likes) the bot sends nothing, whatever Claude says', async () => {
  const { ask, sent } = setup({
    answer: JSON.stringify({
      message: '100个赞已送达',
      others: [{ to: '小红', message: '点好了' }],
    }),
    calls: [{ tool: 'press_like', ms: 6000, isError: false, silent: true }],
  });
  await ask({ asker: '雅', question: '帮主播点点赞' });

  expect(sent).toEqual([]);
});

test('a silent tool that says something itself (too few diamonds) is the only message, once, even after silent likes', async () => {
  const lamp = {
    tool: 'send_fans_lamp',
    ms: 300,
    isError: true,
    silent: true,
    say: '钻石不够点灯牌',
  } as const;
  const { ask, sent } = setup({
    answer: JSON.stringify({ message: '赞点好了，灯牌也加上了' }),
    calls: [{ tool: 'press_like', ms: 6000, isError: false, silent: true }, lamp, lamp],
  });
  await ask({ asker: '雅', question: '先点赞，再加个灯牌' });

  expect(sent).toEqual(['@雅 钻石不够点灯牌']);
});

test('a tool that failed beside silent likes still gets Claude telling why', async () => {
  const { ask, sent } = setup({
    answer: JSON.stringify({ message: '小心心刚送过，过 4 分钟再来' }),
    calls: [
      { tool: 'press_like', ms: 6000, isError: false, silent: true },
      { tool: 'send_heart', ms: 1, isError: true },
    ],
  });
  await ask({ asker: '雅', question: '先点赞，再送个小心心' });

  expect(sent).toEqual(['@雅 小心心刚送过，过 4 分钟再来']);
});

test('Claude leaves the @ out when it is plain whom it answers', async () => {
  const { ask, sent } = setup({
    answer: JSON.stringify({ message: '在的在的', at: false, others: [] }),
  });
  await ask({ asker: '阿明', userId: 'u-阿明' });
  expect(sent).toEqual(['在的在的']);
});

test('the streamer is never @ed, whatever Claude says: answering her, or a message for her', async () => {
  const toHer = setup({
    answer: JSON.stringify({ message: '唱得真好', at: true, others: [] }),
    streamerId: 'u-虾',
  });
  await toHer.ask({ asker: '虾虾', userId: 'u-虾' });
  expect(toHer.sent).toEqual(['唱得真好']);

  const forHer = setup({
    answer: JSON.stringify({
      message: '',
      at: true,
      others: [
        { to: '虾虾', message: '雅说你今天好看' },
        { to: '雅', message: '帮你说啦' },
      ],
    }),
    streamerId: 'u-虾',
  });
  await forHer.ask({
    asker: '雅',
    userId: 'u-雅',
    history: [
      { ts: 0, nickname: '虾虾', userId: 'u-虾', content: '大家好' },
      { ts: 1, nickname: '雅', userId: 'u-雅', content: '帮我夸夸主播' },
    ],
  });
  expect(forHer.sent).toEqual(['雅说你今天好看', '@雅 帮你说啦']);
});

test('the session is told whether the asker is an admin', async () => {
  const { ask, opened } = setup({ admins: { has: (userId) => userId === 'u-雅' } });
  await ask({ asker: '雅', userId: 'u-雅' });
  await ask({ asker: '阿明', userId: 'u-阿明' });
  await ask({ asker: '无名' });
  expect(opened.map(({ admin }) => admin)).toEqual([true, false, false]);
});

test('claude answered logs the tools Claude called with their times, and an unprompted answer as such', async () => {
  const logged: [string, object | undefined][] = [];
  const { outbox } = fakeOutbox();
  const calls = [{ tool: 'identify_song', ms: 820, isError: false }];
  const answerer = new MentionAnswerer({
    ask: () => Promise.resolve(JSON.stringify({ message: '是《晴天》哦' })),
    outbox,
    room: fakeRoom({ now: () => NOW }),
    log: { ...silentLog, info: (message, meta) => void logged.push([message, meta]) },
    promptTemplate: () => '{{question}}',
    tools: {
      open: () => ({
        access: { url: 'u', token: 't', tools: ['identify_song'] },
        used: () => ['identify_song'],
        calls: () => calls,
        close: () => {},
      }),
    },
  });
  answerer.ask({ asker: '阿明', question: '什么歌', history: [], unprompted: 'chat' });
  await answerer.idle();

  expect(logged.find(([message]) => message === 'claude answered')?.[1]).toMatchObject({
    unprompted: 'chat',
    tools: calls,
  });
});

test('the session is opened knowing who the asker is', async () => {
  const { ask, opened } = setup();
  const viewer = { admin: false, badges: ['V年'], payLevel: 31 };
  await ask({ unprompted: 'speech', viewer });

  expect(opened).toEqual([
    { asker: '阿明', userId: undefined, question: '在吗', admin: false, viewer },
  ]);
  expect(opened[0]).not.toHaveProperty('heard');
  expect(opened[0]).not.toHaveProperty('exclude');
});
