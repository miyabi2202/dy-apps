import { ChatHistory } from '../../../src/core/chat/chat-history';
import { Transcript } from '../../../src/core/songs/transcript';
import { fakeMemory, noteFile, ROOM_FILE } from '../../support/fake-memory';
import { fakeRoom } from '../../support/fake-room';
import { testWording } from '../../support/wording';

const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

test("gives every prompt the room as it is now: chat, recent speech, persona, memory, the streamer's note, what the bot said", () => {
  const history = new ChatHistory(2);
  for (const content of ['一', '二', '三']) {
    history.add({ ts: NOW, userId: 'u-1', nickname: '阿明', content });
  }
  const transcript = new Transcript(30 * 60_000, () => NOW);
  transcript.add({ start: NOW - 20 * 60_000, end: NOW - 19 * 60_000, text: '太早了' });
  transcript.add({ start: NOW - 3000, end: NOW, text: '大家好' });
  const { memory, store } = fakeMemory({
    [ROOM_FILE]: '主播是猫猫',
    [noteFile('s-1')]: '爱喝奶茶',
  });
  let persona = '数学老师\n';
  const room = fakeRoom({
    history,
    transcript,
    transcriptMs: 5 * 60_000,
    persona: () => persona,
    memory,
    streamerId: () => 's-1',
    botTalk: { recent: () => '你好呀' },
    chatDir: '/data/chat',
    now: () => NOW,
  });

  expect(room.promptInput()).toEqual({
    wording: testWording,
    aliases: [],
    history: [
      { ts: NOW, userId: 'u-1', nickname: '阿明', content: '二' },
      { ts: NOW, userId: 'u-1', nickname: '阿明', content: '三' },
    ],
    transcript: [{ start: NOW - 3000, end: NOW, text: '大家好' }],
    now: NOW,
    chatDir: '/data/chat',
    persona: '数学老师',
    botName: '小助手',
    memory: '主播是猫猫',
    memoryDir: '/room/memory',
    streamerNote: '爱喝奶茶',
    botTalk: '你好呀',
  });

  // Persona and memory are read each time.
  persona = '小狗';
  store.set(ROOM_FILE, '主播今天生日');
  expect(room.promptInput()).toMatchObject({ persona: '小狗', memory: '主播今天生日' });
});

test("the asker's note is theirs alone: none for the streamer (every prompt has theirs) or in a 私密 room", () => {
  let isPrivate = false;
  const { memory } = fakeMemory(
    {
      [noteFile('s-1')]: '爱喝奶茶',
      [noteFile('u-1')]: '叫 TA 阿明',
      [noteFile('111111-苦***-31')]: '爱听晴天',
    },
    { isPrivate: () => isPrivate },
  );
  const room = fakeRoom({
    memory,
    streamerId: () => 's-1',
    isPrivate: () => isPrivate,
  });
  expect(room.askerNote('u-1')).toBe('叫 TA 阿明');
  expect(room.askerNote('u-2')).toBe('');
  expect(room.askerNote(undefined)).toBe('');
  expect(room.askerNote('s-1')).toBe('');
  isPrivate = true;
  expect(room.askerNote('111111-苦***-31')).toBe('');
});

test('screenshots go to Claude only while on', async () => {
  const frame = new Uint8Array([0xff, 0xd8]);
  let taken = 0;
  const room = fakeRoom({
    screenshot: () => {
      taken++;
      return Promise.resolve(frame);
    },
    screenshotsOn: false,
  });
  expect(await room.screenshot()).toBeUndefined();
  room.screenshots = true;
  expect(await room.screenshot()).toBe(frame);
  room.screenshots = false;
  expect(await room.screenshot()).toBeUndefined();
  // room-feed isn't even asked while screenshots are off, unless a puzzle always wants one.
  expect(taken).toBe(1);
  expect(await room.screenshot(true)).toBe(frame);
});

test('fills a prompt with the room, what is particular to it, and parts of the room it replaces', () => {
  const history = new ChatHistory(10);
  history.add({ ts: NOW, userId: 'u-1', nickname: '阿明', content: '一' });
  const room = fakeRoom({ history, persona: () => '小猫', now: () => NOW });

  expect(
    room.prompt('{{persona}}|{{asker}}|{{question}}|{{history}}', {
      asker: '小红',
      question: '在吗',
      singleLength: 40,
      maxLength: 40,
    }),
  ).toBe('你的人设是小猫|小红|在吗|阿明: 一');
  expect(
    room.prompt('{{history}}|{{singleLength}}', { history: [], singleLength: 40, maxLength: 40 }),
  ).toBe('（暂无）|40');
});

test('lists the settings the features gave, each as it is now, and none when none gave any', () => {
  const room = fakeRoom();
  expect(room.promptInput().settings).toBeUndefined();

  let threshold = 100;
  room.addSettings(() => ({ thanksThreshold: threshold }));
  expect(room.prompt('{{settings}}', { singleLength: 40, maxLength: 40 })).toBe(
    [
      '直播间现在的设置（机器人管理员可以用指令修改）：',
      '- 截图：开（你能看到直播画面）',
      '- 自动谢礼：5 分钟内送礼超过 100 钻的观众会收到感谢',
    ].join('\n'),
  );

  threshold = 200;
  room.screenshots = false;
  expect(room.promptInput().settings).toEqual({
    thanksThreshold: 200,
    screenshots: false,
  });
});

test("knows what the bot's own account wears from its own latest chat, and keeps it once that scrolls away", () => {
  const history = new ChatHistory(2);
  const room = fakeRoom({ history, botId: 'bot-1' });
  expect(room.promptInput().ownBadges).toBeUndefined();

  const own = { ts: NOW, userId: 'bot-1', nickname: '小助手', content: '到', payLevel: 17 };
  history.add({ ...own, fansClub: { level: 5 } });
  history.add({ ...own, fansClub: { level: 6 }, payLevel: 18 });
  expect(room.promptInput().ownBadges).toEqual({ fansLevel: 6, payLevel: 18 });

  // Someone else's 灯牌 is theirs: only the bot's own line counts.
  for (const content of ['一', '二']) {
    history.add({ ts: NOW, userId: 'u-1', nickname: '阿明', content, fansClub: { level: 20 } });
  }
  expect(room.promptInput().ownBadges).toEqual({ fansLevel: 6, payLevel: 18 });
});

test("the prompt tells the bot what it wears by its name, after the settings, and nothing when it doesn't know", () => {
  const ask = (ownBadges?: { fansLevel?: number; payLevel?: number }) =>
    fakeRoom().prompt('{{settings}}', { singleLength: 50, maxLength: 50, ownBadges });
  expect(ask({ fansLevel: 5, payLevel: 17 })).toContain(
    '你自己这个账号名字旁边挂着：主播的粉丝团灯牌 5 级、财富等级 17 级',
  );
  expect(ask({ payLevel: 17 })).toContain('名字旁边挂着：财富等级 17 级');
  expect(ask()).not.toContain('名字旁边挂着');
});
