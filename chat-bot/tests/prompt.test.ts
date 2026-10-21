import { buildPrompt } from '../src/core/prompt';
import { testWording } from './wording';

const input = {
  wording: testWording,
  history: [],
  transcript: [],
  now: 0,
  singleLength: 40,
  maxLength: 200,
};

test('{{intro}} is what the bot says about itself, under a heading, and empty without it', () => {
  const filled = buildPrompt('{{intro}}', { ...input, intro: '我是「默认关闭」\n' });
  expect(filled).toContain('关于你自己');
  expect(filled.endsWith('我是「默认关闭」')).toBe(true);
  expect(buildPrompt('{{intro}}', { ...input, intro: ' \n' })).toBe('');
  expect(buildPrompt('{{intro}}', input)).toBe('');
});

test('{{limitations}} is what the bot cannot do, to explain only when asked, and empty without it', () => {
  const filled = buildPrompt('{{limitations}}', { ...input, limitations: '- 听：可能听错\n' });
  expect(filled).toContain('没人问就不要主动提');
  expect(filled.endsWith('- 听：可能听错')).toBe(true);
  expect(buildPrompt('{{limitations}}', input)).toBe('');
});

test('{{history}} shows the recent gifts among the chat, by time', () => {
  const prompt = buildPrompt('{{history}}', {
    history: [
      { ts: 1, userId: 'u-1', nickname: '阿明', content: '好听' },
      { ts: 3, userId: 'u-2', nickname: '小红', content: '谢一下这个礼物' },
    ],
    gifts: [
      {
        ts: 2,
        userId: '111111-澳***-38',
        nickname: '澳***',
        name: '比心兔兔',
        count: 1,
        diamonds: 299,
      },
    ],
    wording: testWording,
    transcript: [],
    now: 4,
    singleLength: 40,
    maxLength: 40,
  });
  expect(prompt).toBe('阿明: 好听\n澳***: （送出 比心兔兔×1，299钻）\n小红: 谢一下这个礼物');
});

test('{{today}} is the date and the weekday', () => {
  const tuesday = new Date(2026, 9, 20, 9, 30).getTime();
  expect(buildPrompt('{{today}} {{now}}', { ...input, now: tuesday })).toBe(
    '2026-10-20 星期二 09:30:00',
  );
});

test('{{aliases}} says the room’s other names for the bot mean it too, and is nothing without any', () => {
  expect(buildPrompt('{{persona}}{{aliases}}|', { ...input, persona: '小猫' })).toBe(
    '你的人设是小猫|',
  );
  expect(buildPrompt('{{aliases}}', { ...input, aliases: [] })).toBe('');
  const filled = buildPrompt('{{persona}}{{aliases}}', {
    ...input,
    persona: '小猫',
    aliases: ['Fairy', '菲瑞'],
  });
  expect(filled).toMatch(/^你的人设是小猫\n.*「Fairy、菲瑞」/);
});
