import { Billing } from '../src/app/billing';
import { MentionAnswerer, type Mention } from '../src/app/mention-answerer';
import type { RoomStateOptions } from '../src/app/room-state';
import type { UserTalk } from '../src/app/ports';
import { Transcript } from '../src/core/transcript';
import { fakeRoom } from './fake-room';
import { NOW, fakeOutbox, memoryWallet, silentLog } from './fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  maxReplyLength?: number;
  maxPending?: number;
  template?: string;
  transcript?: Transcript;
  screenshot?: () => Promise<Uint8Array>;
  wallet?: ReturnType<typeof memoryWallet>;
  ask?: () => Promise<string>;
  chatDir?: string;
  persona?: string;
  userTalk?: UserTalk;
  botTalk?: string;
  settings?: RoomStateOptions['settings'];
  commands?: () => string;
}

function setup(options: SetupOptions = {}) {
  const prompts: string[] = [];
  const images: (Uint8Array | undefined)[] = [];
  const { outbox, sent } = fakeOutbox();
  const room = fakeRoom({
    transcript: options.transcript,
    screenshot: options.screenshot,
    persona: options.persona,
    chatDir: options.chatDir,
    botTalk: options.botTalk === undefined ? undefined : { recent: () => options.botTalk ?? '' },
    settings: options.settings,
    commands: options.commands,
    screenshotsOn: !!options.screenshot,
    now: () => NOW,
  });
  const answerer = new MentionAnswerer({
    ask: ({ prompt, image }) => {
      prompts.push(prompt);
      images.push(image);
      return options.ask ? options.ask() : Promise.resolve(options.answer ?? '你好呀');
    },
    outbox,
    room,
    log: silentLog,
    promptTemplate: () => options.template ?? TEMPLATE,
    billing: options.wallet && new Billing({ wallet: options.wallet }),
    userTalk: options.userTalk,
    maxReplyLength: options.maxReplyLength,
    maxPending: options.maxPending,
  });
  return {
    /** Asks Claude, then waits for the answer and for everything to be sent. */
    ask: async (mention: Partial<Mention> = {}) => {
      const queued = answerer.ask({
        asker: '阿明',
        paid: 0,
        question: '在吗',
        history: [],
        ...mention,
      });
      await answerer.idle();
      await outbox.idle();
      return queued;
    },
    answerer,
    prompts,
    images,
    sent,
  };
}

test('answers with the chat before the question, and replies to the asker', async () => {
  const { ask, prompts, sent } = setup();
  await ask({
    question: '这题怎么做',
    history: [
      { ts: 1, userId: 'u-阿明', nickname: '阿明', content: '主播好' },
      { ts: 2, userId: 'u-小红', nickname: '小红', content: '今天讲什么' },
    ],
  });

  expect(prompts).toEqual(['阿明: 主播好\n小红: 今天讲什么\n---\n阿明: 这题怎么做 (45)']);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('puts the reply on one line and cuts it to the length limit', async () => {
  const { ask, sent } = setup({ answer: '  第一行\n第二行很长很长  ', maxReplyLength: 10 });
  await ask();

  expect(sent).toEqual(['@阿明 第一行 第二']);
});

test('does not repeat the @ when Claude already starts with it', async () => {
  const { ask, sent } = setup({ answer: '@阿明 @阿明 等于2' });
  await ask();

  expect(sent).toEqual(['@阿明 等于2']);
});

test('drops the sources list web search adds', async () => {
  const { ask, sent } = setup({
    answer: '大约41.89万亲密度\n\nSources:\n- [jb51](https://jb51.net)',
  });
  await ask();

  expect(sent).toEqual(['@阿明 大约41.89万亲密度']);
});

test('passes the last minutes of what the streamer (or a guest) said or sang, and a screenshot', async () => {
  const transcript = new Transcript(30 * 60_000, () => NOW);
  const said = (minutesAgo: number, text: string, speech = 0.8, host = true) => {
    const end = NOW - minutesAgo * 60_000;
    transcript.add({ start: end - 3000, end, text, speech, host });
  };
  said(8, '太早了');
  said(2, '吕布一开始是文官');
  said(1.75, '你那边卡了', 0.8, false);
  said(1.5, '寒江陪烟火', 0.05);
  said(1, '谢谢点赞');
  const frame = new Uint8Array([0xff, 0xd8]);
  const { ask, prompts, images } = setup({
    template: '{{now}}\n{{transcript}}',
    transcript,
    screenshot: () => Promise.resolve(frame),
  });
  await ask();

  expect(prompts).toEqual([
    '08:00:00\n07:57:57 吕布一开始是文官\n07:58:12 （连线）你那边卡了\n07:58:27 （唱）寒江陪烟火\n07:58:57 谢谢点赞',
  ]);
  expect(images).toEqual([frame]);
});

test('answers without a picture when the screenshot fails', async () => {
  const { ask, sent, images } = setup({
    screenshot: () => Promise.reject(new Error('房间未连接')),
  });
  await ask();

  expect(images).toEqual([undefined]);
  expect(sent).toEqual(['@阿明 你好呀']);
});

test('points Claude at the record folder, and tells it who it plays', async () => {
  const { ask, prompts } = setup({
    template: '{{chatDir}}|{{persona}}',
    chatDir: '/data/chat/1',
    persona: '数学老师',
  });
  await ask();

  expect(prompts).toEqual(['/data/chat/1|你的人设是数学老师']);
});

test("tells Claude the room settings, the asker's balance and the commands", async () => {
  const settings = {
    mentionCost: 2,
    talkThreshold: 1,
    thanksThreshold: 100,
    wakeWord: '我想吃鱼了',
  };
  const { ask, prompts } = setup({
    template: '{{settings}}\n---\n{{commands}}',
    wallet: memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 10, spent: 3 } }),
    settings: () => settings,
    commands: () => '## The commands\n\n/识歌',
  });
  await ask({ userId: 'u-阿明' });
  settings.talkThreshold = 0.6;
  settings.thanksThreshold = 99999;
  settings.wakeWord = '';
  await ask({ userId: 'u-阿明' });

  expect(prompts).toEqual([
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 每次 @ 你：2 钻，用观众给主播送过的礼物抵（不会另外扣观众的钱）',
      '- 截图：关（你看不到直播画面）',
      '- 自动回复：关闭',
      '- 自动谢礼：5 分钟内送礼超过 100 钻的观众会收到感谢',
      '- 唤醒词：「我想吃鱼了」（主播说出来，你就会主动说一句，不收费）',
      '- 阿明 送的礼物还剩：7 钻可用',
      '---',
      '## The commands\n\n/识歌',
    ].join('\n'),
    expect.stringContaining(
      '- 自动回复：开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 0.6）\n- 自动谢礼：关闭\n- 唤醒词：无\n',
    ),
  ]);
});

test('gives the diamond back when the mention cannot be answered', async () => {
  const wallet = memoryWallet({ 'u-阿明': { nickname: '阿明', gifted: 1, spent: 1 } });
  const { ask, sent } = setup({
    wallet,
    ask: () => Promise.reject(new Error('claude timed out')),
  });
  await ask({ userId: 'u-阿明', paid: 1 });

  expect(sent).toEqual([]);
  expect(wallet.balance('u-阿明')).toBe(1);
});

test('drops what waits beyond the limit, answering the rest in order', async () => {
  const finish: ((answer: string) => void)[] = [];
  const { answerer, sent } = setup({
    maxPending: 1,
    ask: () => new Promise((resolve) => finish.push(resolve)),
  });
  const mention = (asker: string): Mention => ({ asker, paid: 0, question: '在吗', history: [] });

  // The first is with Claude at once, the second waits, the third doesn't fit.
  expect(answerer.ask(mention('甲'))).toBe(true);
  expect(answerer.ask(mention('乙'))).toBe(true);
  expect(answerer.ask(mention('丙'))).toBe(false);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
  finish[0]?.('一');
  await tick();
  finish[1]?.('二');
  await answerer.idle();

  expect(sent).toEqual(['@甲 一', '@乙 二']);
});

test("remembers each viewer's exchanges and what the bot said, for the next prompt", async () => {
  const talk = new Map<string, string[]>();
  const userTalk: UserTalk = {
    add: (userId, { nickname, question, answer }) =>
      talk.set(userId, [
        ...(talk.get(userId) ?? []),
        `${nickname}问：${question}`,
        `你答：${answer}`,
      ]),
    recent: (userId) => (talk.get(userId) ?? []).join('\n'),
  };
  const { ask, prompts } = setup({
    userTalk,
    botTalk: '你好呀',
    template: '{{botTalk}}|{{userHistory}}|{{question}}',
  });
  await ask({ userId: 'u-阿明', question: '在吗' });
  await ask({ userId: 'u-阿明', question: '还记得我吗' });
  await ask({ asker: '小红', userId: 'u-小红', question: '我呢' });

  expect(prompts).toEqual([
    '你好呀|（暂无）|在吗',
    '你好呀|阿明问：在吗\n你答：@阿明 你好呀|还记得我吗',
    '你好呀|（暂无）|我呢',
  ]);
});
