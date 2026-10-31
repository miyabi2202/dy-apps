import { buildPrompt } from '../../../src/core/prompts/prompt';
import { testWording } from '../../support/wording';

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

test('{{asked}} says how the asker reached the bot, and names the tools a line matched as a hint', () => {
  const asked = { ...input, asker: '阿明', question: '秒了' };
  expect(buildPrompt('{{asked}}', asked)).toBe(
    testWording('asked-mention', { asker: '阿明', said: '秒了' }),
  );
  const hinted = buildPrompt('{{asked}}', { ...asked, unprompted: 'chat', topics: ['too_easy'] });
  expect(hinted).toBe(
    `${testWording('asked-chat', { asker: '阿明', said: '秒了' })}\n${testWording('asked-topics', { tools: 'too_easy' })}`,
  );
  expect(buildPrompt('{{asked}}', { ...asked, unprompted: 'chat', topics: [] })).toBe(
    testWording('asked-chat', { asker: '阿明', said: '秒了' }),
  );
});

test('{{asked}} puts what the asker said while waiting before their latest line, as one request', () => {
  const asked = buildPrompt('{{asked}}', {
    ...input,
    asker: '虾虾',
    question: '我发文字你看能不能识别',
    earlier: ['谷村新司的サライ国语版是什么'],
    unprompted: 'speech',
  });
  expect(asked).toBe(
    `${testWording('asked-earlier', { asker: '虾虾', lines: '- 谷村新司的サライ国语版是什么' })}\n${testWording('asked-speech', { asker: '虾虾', said: '我发文字你看能不能识别' })}`,
  );
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

test('{{forbiddenTopics}} is the rules for topics as they are, and empty without them', () => {
  expect(
    buildPrompt('{{forbiddenTopics}}', { ...input, forbiddenTopics: '- 不碰投资理财\n' }),
  ).toBe('- 不碰投资理财');
  expect(buildPrompt('[{{forbiddenTopics}}]', input)).toBe('[]');
});

test('{{commonKnowledge}} gives Douyin common knowledge under a heading, and is empty without any', () => {
  const filled = buildPrompt('{{commonKnowledge}}', {
    ...input,
    commonKnowledge: '## 灯牌\n\n粉丝团的徽章\n',
  });
  expect(filled).toContain('## 灯牌\n\n粉丝团的徽章');
  expect(filled).not.toBe('## 灯牌\n\n粉丝团的徽章');
  expect(buildPrompt('[{{commonKnowledge}}]', { ...input, commonKnowledge: ' \n' })).toBe('[]');
});

test('{{memory}} says where the older memories are kept, which the prompt does not repeat', () => {
  const filled = buildPrompt('{{memory}}', {
    ...input,
    memory: '主播叫咿咿\n',
    memoryDir: '/data/1/memory',
  });
  expect(filled).toContain('主播叫咿咿');
  expect(filled).toContain('/data/1/memory 的 archive.md');
  expect(buildPrompt('{{memory}}', input)).toBe('');
});

test("{{memory}} ends with the bot's own thoughts after the last streams, and leaves them out when there are none", () => {
  const filled = buildPrompt('{{memory}}', {
    ...input,
    memory: '主播叫咿咿\n',
    thoughts: '2026-10-31：主人说下次唱稻香，下次问问她\n',
  });
  expect(filled).toContain('主播叫咿咿');
  expect(filled).toContain('你上几场直播后自己的想法');
  expect(filled.indexOf('主播叫咿咿')).toBeLessThan(filled.indexOf('主人说下次唱稻香'));
  // Thoughts with nothing else remembered still come.
  expect(buildPrompt('{{memory}}', { ...input, thoughts: '2026-10-31：想问的' })).toContain(
    '想问的',
  );
  expect(buildPrompt('{{memory}}', { ...input, thoughts: ' ' })).toBe('');
});
