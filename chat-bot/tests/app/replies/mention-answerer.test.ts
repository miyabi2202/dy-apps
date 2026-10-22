import { SETTING_DEFAULTS } from '../../../src/core/commands/settings';
import type { EventBus } from '../../../src/app/event-bus';
import { MentionAnswerer, type Mention } from '../../../src/app/replies/mention-answerer';
import type { SettingsPart } from '../../../src/app/room/room-state';
import type { UserTalk } from '../../../src/app/ports';
import { Transcript } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';
import { NOW, fakeBus, fakeOutbox, silentLog } from '../../support/fakes';

const TEMPLATE = '{{history}}\n---\n{{asker}}: {{question}} ({{singleLength}})';

interface SetupOptions {
  answer?: string;
  maxReplyLength?: number;
  maxPending?: number;
  template?: string;
  transcript?: Transcript;
  screenshot?: () => Promise<Uint8Array>;
  ask?: () => Promise<string>;
  chatDir?: string;
  persona?: string;
  userTalk?: UserTalk;
  bus?: Pick<EventBus, 'emit'>;
  botTalk?: string;
  settings?: () => SettingsPart;
  commands?: () => string;
}

function setup(options: SetupOptions = {}) {
  const prompts: string[] = [];
  const images: (Uint8Array | undefined)[] = [];
  const { outbox, sent } = fakeOutbox();
  const room = fakeRoom({
    transcript: options.transcript,
    screenshot: options.screenshot,
    persona: () => options.persona ?? '',
    chatDir: options.chatDir,
    botTalk: options.botTalk === undefined ? undefined : { recent: () => options.botTalk ?? '' },
    commands: options.commands,
    screenshotsOn: !!options.screenshot,
    now: () => NOW,
  });
  if (options.settings) room.addSettings(options.settings);
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
    userTalk: options.userTalk,
    bus: options.bus,
    maxReplyLength: options.maxReplyLength,
    maxPending: options.maxPending,
  });
  return {
    /** Asks Claude, then waits for the answer and for everything to be sent. */
    ask: async (mention: Partial<Mention> = {}) => {
      const queued = answerer.ask({
        asker: '阿明',
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

test('puts the reply on one line, cut to the limit when not even numbered parts fit', async () => {
  const { ask, sent } = setup({ answer: '  第一行\n第二行很长很长  ', maxReplyLength: 10 });
  await ask();

  expect(sent).toEqual(['@阿明 第一行 第二']);
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

test('tells Claude the room settings and the commands', async () => {
  const settings = {
    autoReplyThreshold: 1,
    thanksThreshold: 100,
  };
  const { ask, prompts } = setup({
    template: '{{settings}}\n---\n{{commands}}',
    settings: () => settings,
    commands: () => '## The commands\n\n/识歌',
  });
  await ask({ userId: 'u-阿明' });
  settings.autoReplyThreshold = 0.6;
  settings.thanksThreshold = 99999;
  await ask({ userId: 'u-阿明' });

  expect(prompts).toEqual([
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 截图：关（你看不到直播画面）',
      '- 自动回复：关闭',
      '- 自动谢礼：5 分钟内送礼超过 100 钻的观众会收到感谢',
      '---',
      '## The commands\n\n/识歌',
    ].join('\n'),
    expect.stringContaining(
      '- 自动回复：开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 0.6）\n- 自动谢礼：关闭\n',
    ),
  ]);
});

test('drops what waits beyond the limit, answering the rest in order', async () => {
  const finish: ((answer: string) => void)[] = [];
  const { answerer, sent } = setup({
    maxPending: 1,
    ask: () => new Promise((resolve) => finish.push(resolve)),
  });
  const mention = (asker: string): Mention => ({ asker, question: '在吗', history: [] });

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

test('an answer that @s others sends each their own message, and counts those in the chat as answered', async () => {
  const answered: string[] = [];
  const bus = fakeBus();
  bus.on('answered', ({ userId }) => void answered.push(userId));
  const { ask, sent } = setup({
    answer: JSON.stringify({
      message: '翻完了',
      others: [
        { to: '白生漓', message: '报了 5，答案是 3' },
        { to: '路过的', message: '你也错了' },
      ],
    }),
    bus,
  });
  await ask({
    userId: 'u-雅',
    asker: '雅',
    template: '翻旧账',
    jsonMessage: true,
    atOthers: true,
    history: [{ ts: NOW, nickname: '白生漓', userId: 'u-白', content: '秒了，5' }],
  });

  expect(sent).toEqual(['@雅 翻完了', '@白生漓 报了 5，答案是 3', '@路过的 你也错了']);
  // In the order they went out; 路过的 said nothing lately, so there's no one to follow up.
  expect(answered).toEqual(['u-雅', 'u-白']);
});

test("the usual prompt's answer may @ someone else instead of the asker", async () => {
  const { ask, sent } = setup({
    answer: JSON.stringify({
      message: '招呼打好啦',
      others: [{ to: '🍄老杨', message: '杨叔早上好，谢谢山药' }],
      command_request: '',
      command_args: '',
    }),
  });
  await ask({ userId: 'u-红', asker: '红枫不会', question: '来跟我杨叔打个招呼' });

  expect(sent).toEqual(['@🍄老杨 杨叔早上好，谢谢山药']);
});

test("a command's prompt sees the badges by the asker's name, from their latest chat line", async () => {
  const { ask, prompts } = setup({ template: '{{askerBadges}}' });
  await ask({
    userId: 'u-阿明',
    history: [
      { ts: 1, userId: 'u-阿明', nickname: '阿明', content: '讲讲曲面积分', badges: ['V年'] },
      { ts: 2, userId: 'u-小红', nickname: '小红', content: '同问', badges: ['V'] },
    ],
  });
  // Nobody's badges known (room-feed doesn't send them yet), or said on the stream: none.
  await ask({
    userId: 'u-小红',
    history: [{ ts: 3, userId: 'u-小红', nickname: '小红', content: '讲讲' }],
  });
  await ask({});

  expect(prompts).toEqual(['V年', '（无）', '（无）']);
});

test("the reply @s the whole nickname when it fits, and only a shortened @ goes without the room's 单推符号", async () => {
  const asker = '⊹꙳𝝑阿拂（吃荷灵咪馊饭版）𝝔⋆₊';
  const answers = [
    '先换首顺手的唱',
    '先换首顺手的唱回回血，这首的调交给二号去研究，不开心的锅归伴奏不归茜茜',
  ];
  const { outbox, sent } = fakeOutbox();
  const answerer = new MentionAnswerer({
    ask: () => Promise.resolve(answers.shift()!),
    outbox,
    room: fakeRoom({ atTrimStart: () => ['⊹꙳𝝑'], now: () => NOW }),
    log: silentLog,
    promptTemplate: () => TEMPLATE,
  });
  answerer.ask({ asker, question: '怎么办', history: [] });
  await answerer.idle();
  answerer.ask({ asker, question: '怎么办', history: [] });
  await answerer.idle();
  await outbox.idle();
  expect(sent[0]).toBe(`@${asker} 先换首顺手的唱`);
  expect(sent[1]).toBe(
    '@阿拂（ 先换首顺手的唱回回血，这首的调交给二号去研究，不开心的锅归伴奏不归茜茜',
  );
});

test('/最大回复条数 sets how many messages an answer may take, kept in the room settings', async () => {
  const stored: Record<string, unknown> = {};
  const settings = {
    get: () => ({ ...SETTING_DEFAULTS, ...stored }),
    set: (patch: object) => void Object.assign(stored, patch),
  };
  const { outbox, sent } = fakeOutbox();
  const answerer = new MentionAnswerer({
    ask: () => Promise.resolve('一二三四五六七八九十。'.repeat(20)),
    outbox,
    room: fakeRoom({ now: () => NOW, settings }),
    log: silentLog,
    promptTemplate: () => TEMPLATE,
  });
  const [command] = answerer.commands();
  const run = (args: string) =>
    command && 'run' in command && command.run ? command.run(args) : undefined;

  expect(await run('0')).toEqual({
    ok: false,
    reply: '条数要写成 1 到 10 的整数，用法：/最大回复条数 3',
  });
  expect(await run('两')).toMatchObject({ ok: false });
  expect(await run('2')).toEqual({ ok: true, reply: '已处理最大回复条数请求' });
  expect(stored).toEqual({ maxReplyParts: 2 });

  answerer.ask({ asker: '阿明', question: '讲讲', history: [] });
  await answerer.idle();
  await outbox.idle();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatch(/^@阿明 \(1\/2\) /);
});
