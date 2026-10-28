import type { RoomLine } from '../../../src/core/chat/relevance';
import {
  chooseTargets,
  parseReplyPick,
  pickLines,
  pickPrompt,
  type TargetRules,
} from '../../../src/core/replies/reply-pick';
import { testWording } from '../../support/wording';

test('reads the picks, and rejects what is not the schema', () => {
  expect(parseReplyPick('{"picks":[{"line":2,"confidence":0.7}]}')).toEqual([
    { line: 2, confidence: 0.7 },
  ]);
  // A field it is no longer asked for is dropped.
  expect(parseReplyPick('{"picks":[{"line":1,"confidence":0.9,"command":"can-sing"}]}')).toEqual([
    { line: 1, confidence: 0.9 },
  ]);
  expect(parseReplyPick('{"picks":[]}')).toEqual([]);

  expect(parseReplyPick('机器人你好')).toBeNull();
  expect(parseReplyPick('{}')).toBeNull();
  expect(parseReplyPick('{"picks":"none"}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1.5,"confidence":0.7}]}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1,"confidence":"high"}]}')).toBeNull();
  expect(parseReplyPick('{"picks":[{"line":1}]}')).toBeNull();
});

test('numbers only the lines that may be answered, stars the ones about the bot, indents the rest', () => {
  const line = (who: string, text: string, ts = 20_000): RoomLine => ({
    ts,
    who,
    text,
    candidate: true,
  });
  const lines = [line('阿明', '今晚吃火锅'), line('小红', '机器人你几岁'), line('小蓝', '哈哈')];
  const { text, numbered } = pickLines(lines, (l) => l.who !== '阿明', new Set([lines[1]!]));

  expect(numbered).toEqual([lines[1], lines[2]]);
  expect(text).toBe(
    [
      '     00:00:20 [阿明] 今晚吃火锅',
      '(1)★ 00:00:20 [小红] 机器人你几岁',
      '(2)  00:00:20 [小蓝] 哈哈',
    ].join('\n'),
  );
});

test("marks the lines matching a tool's listen with the tool", () => {
  const line = (who: string, text: string): RoomLine => ({
    ts: 20_000,
    who,
    userId: `u-${who}`,
    text,
    candidate: true,
  });
  const lines = [line('阿明', '虾虾会喂猪吗'), line('小红', '今晚吃火锅')];
  const { text } = pickLines(
    lines,
    () => true,
    new Set(),
    (l) => (l.text.includes('会') ? ['can_sing'] : []),
  );
  expect(text).toBe(
    '(1)  00:00:20 [阿明] 虾虾会喂猪吗  → can_sing\n(2)  00:00:20 [小红] 今晚吃火锅',
  );
});

describe('choosing whom to answer', () => {
  const chat = (who: string, text: string): RoomLine => ({
    ts: 1000,
    who,
    userId: `u-${who}`,
    text,
    candidate: true,
  });
  const speech: RoomLine = { ts: 1000, who: '主播', text: '机器人你好', candidate: true };
  const numbered = [
    chat('阿明', '机器人在吗'),
    chat('小红', '主播会唱晴天吗'),
    speech,
    chat('小蓝', '哈哈'),
  ];
  const notes: [string, object][] = [];
  const rules = (over: Partial<TargetRules> = {}): TargetRules => ({
    threshold: 0.6,
    max: 3,
    streamer: { uid: 'host', nickname: '雅' },
    allowed: () => true,
    note: (message, meta) => void notes.push([message, meta]),
    ...over,
  });
  beforeEach(() => void (notes.length = 0));

  test('answers what it is sure of, surest first, each person once, the streamer as themselves', () => {
    const targets = chooseTargets(
      [
        { line: 1, confidence: 0.7 },
        { line: 2, confidence: 0.4 },
        { line: 3, confidence: 0.95 },
        { line: 1, confidence: 0.9 },
      ],
      numbered,
      rules(),
    );
    expect(targets).toEqual([
      {
        nickname: '雅',
        userId: 'host',
        question: '机器人你好',
        heard: 'speech',
        confidence: 0.95,
        line: speech,
      },
      {
        nickname: '阿明',
        userId: 'u-阿明',
        question: '机器人在吗',
        heard: 'chat',
        confidence: 0.9,
        line: numbered[0],
      },
    ]);
  });

  test('answers at most `max`, and nothing said on the stream while the streamer is unknown', () => {
    const picks = numbered.map((_, i) => ({ line: i + 1, confidence: 0.9 - i / 100 }));
    expect(chooseTargets(picks, numbered, rules({ max: 2 })).map((t) => t.nickname)).toEqual([
      '阿明',
      '小红',
    ]);
    expect(
      chooseTargets(picks, numbered, rules({ streamer: null })).map((t) => t.nickname),
    ).toEqual(['阿明', '小红', '小蓝']);
  });

  test('a pick is answered only if the line is allowed, and one for a line that is not there is ignored', () => {
    const targets = chooseTargets(
      [
        { line: 1, confidence: 0.9 },
        { line: 2, confidence: 0.8 },
        { line: 9, confidence: 0.99 },
      ],
      numbered,
      rules({ allowed: (line) => line.text.includes('会唱') }),
    );
    expect(targets.map((t) => t.nickname)).toEqual(['小红']);
    expect(notes).toEqual([['pick dropped: not about the bot', { text: '机器人在吗' }]]);
  });
});

test('the picker is told the topics the tools listen for, with only the admins’ marked, and nothing without any', () => {
  const values = { lines: '(1) 你好', botName: '小助手', persona: '', botTalk: '' };
  const template = '{{lines}}\n{{topics}}|';
  expect(pickPrompt(template, testWording, values)).toBe('(1) 你好\n|');

  const prompt = pickPrompt(template, testWording, {
    ...values,
    topics: [
      { name: 'can_sing', when: '在问主播会不会唱某首歌' },
      { name: 'only_admin', when: '主播要叫它做事', adminOnly: true },
    ],
  });
  expect(prompt).toContain(testWording('pick-topics-head'));
  expect(prompt).toContain('- can_sing：在问主播会不会唱某首歌\n');
  expect(prompt).toContain('- only_admin：主播要叫它做事（只有主播和机器人管理员）');
  expect(prompt).toContain(testWording('pick-topics-tail'));
  expect(prompt.indexOf('can_sing')).toBeLessThan(prompt.indexOf('only_admin'));
});
