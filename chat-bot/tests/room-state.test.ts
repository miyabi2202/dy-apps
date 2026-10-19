import { ChatHistory } from '../src/core/chat-history';
import { Transcript } from '../src/core/transcript';
import { screenshotCommand } from '../src/app/room-state';
import { fakeRoom } from './fake-room';

const NOW = Date.UTC(2026, 9, 16, 8, 0, 0);

test('gives every prompt the room as it is now: chat, recent speech, persona, context, what the bot said', () => {
  const history = new ChatHistory(2);
  for (const content of ['一', '二', '三']) {
    history.add({ ts: NOW, userId: 'u-1', nickname: '阿明', content });
  }
  const transcript = new Transcript(30 * 60_000, () => NOW);
  transcript.add({ start: NOW - 20 * 60_000, end: NOW - 19 * 60_000, text: '太早了' });
  transcript.add({ start: NOW - 3000, end: NOW, text: '大家好' });
  let context = '主播是猫猫';
  const room = fakeRoom({
    history,
    transcript,
    transcriptMs: 5 * 60_000,
    persona: '数学老师',
    context: () => context,
    botTalk: { recent: () => '你好呀' },
    chatDir: '/data/chat',
    now: () => NOW,
  });

  expect(room.promptInput()).toEqual({
    history: [
      { ts: NOW, userId: 'u-1', nickname: '阿明', content: '二' },
      { ts: NOW, userId: 'u-1', nickname: '阿明', content: '三' },
    ],
    transcript: [{ start: NOW - 3000, end: NOW, text: '大家好' }],
    now: NOW,
    chatDir: '/data/chat',
    persona: '数学老师',
    botName: '小助手',
    context: '主播是猫猫',
    botTalk: '你好呀',
  });

  // Persona and context are read each time.
  room.persona = '小猫';
  context = '主播今天生日';
  expect(room.promptInput()).toMatchObject({ persona: '小猫', context: '主播今天生日' });
});

test('screenshots go to Claude only while on, and admins switch them with /截图', async () => {
  const frame = new Uint8Array([0xff, 0xd8]);
  let taken = 0;
  const room = fakeRoom({
    screenshot: () => {
      taken++;
      return Promise.resolve(frame);
    },
    screenshotsOn: false,
  });
  const command = screenshotCommand(room);
  if (!command.run) throw new Error('/截图 runs code');

  expect(await room.screenshot()).toBeUndefined();
  expect(command.run('1')).toEqual({ ok: true, reply: '已处理截图请求' });
  expect(await room.screenshot()).toBe(frame);
  expect(command.run('2')).toEqual({
    ok: false,
    reply: '要写 0（关闭）或 1（打开），用法：/截图 1',
  });
  expect(command.run('0')).toEqual({ ok: true, reply: '已处理截图请求' });
  expect(await room.screenshot()).toBeUndefined();
  // DyHub isn't even asked while screenshots are off, unless a command always wants one.
  expect(taken).toBe(1);
  expect(await room.screenshot(true)).toBe(frame);
  expect(command.adminOnly).toBe(true);
});
