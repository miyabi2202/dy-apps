import type { RoomLine } from '../../../src/core/chat/relevance';
import {
  chooseTargets,
  parseReplyPick,
  pickLines,
  type TargetRules,
} from '../../../src/core/replies/reply-pick';

test('reads the picks, and rejects what is not the schema', () => {
  expect(parseReplyPick('{"picks":[{"line":2,"confidence":0.7}]}')).toEqual([
    { line: 2, confidence: 0.7, command: '' },
  ]);
  expect(parseReplyPick('{"picks":[{"line":1,"confidence":0.9,"command":"can-sing"}]}')).toEqual([
    { line: 1, confidence: 0.9, command: 'can-sing' },
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

test("marks the lines matching a room command's trigger with the command", () => {
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
    (l) => (l.text.includes('会') ? ['can-sing'] : []),
  );
  expect(text).toBe(
    '(1)  00:00:20 [阿明] 虾虾会喂猪吗  → can-sing\n(2)  00:00:20 [小红] 今晚吃火锅',
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
    commandIds: new Set(['can-sing']),
    chatty: () => true,
    cameFor: () => undefined,
    note: (message, meta) => void notes.push([message, meta]),
    ...over,
  });
  beforeEach(() => void (notes.length = 0));

  test('answers what it is sure of, surest first, each person once, the streamer as themselves', () => {
    const targets = chooseTargets(
      [
        { line: 1, confidence: 0.7, command: '' },
        { line: 2, confidence: 0.4, command: '' },
        { line: 3, confidence: 0.95, command: '' },
        { line: 1, confidence: 0.9, command: '' },
      ],
      numbered,
      rules(),
    );
    expect(targets).toEqual([
      { nickname: '雅', userId: 'host', question: '机器人你好', heard: 'speech', confidence: 0.95 },
      {
        nickname: '阿明',
        userId: 'u-阿明',
        question: '机器人在吗',
        heard: 'chat',
        confidence: 0.9,
      },
    ]);
  });

  test('answers at most `max`, and nothing said on the stream while the streamer is unknown', () => {
    const picks = numbered.map((_, i) => ({ line: i + 1, confidence: 0.9 - i / 100, command: '' }));
    expect(chooseTargets(picks, numbered, rules({ max: 2 })).map((t) => t.nickname)).toEqual([
      '阿明',
      '小红',
    ]);
    expect(
      chooseTargets(picks, numbered, rules({ streamer: null })).map((t) => t.nickname),
    ).toEqual(['阿明', '小红', '小蓝']);
  });

  test('answers with the room command it picked, and as usual for one the room does not have', () => {
    const targets = chooseTargets(
      [
        { line: 2, confidence: 0.9, command: 'can-sing' },
        { line: 1, confidence: 0.8, command: 'nope' },
        { line: 9, confidence: 0.99, command: '' },
      ],
      numbered,
      rules(),
    );
    expect(targets.map((t) => [t.nickname, t.command])).toEqual([
      ['小红', 'can-sing'],
      ['阿明', undefined],
    ]);
    expect(targets[1]).not.toHaveProperty('command');
  });

  test('a line that came only for a room command goes to it, or is dropped when there is none', () => {
    const picks = [
      { line: 1, confidence: 0.9, command: '' },
      { line: 2, confidence: 0.8, command: '' },
    ];
    const targets = chooseTargets(
      picks,
      numbered,
      rules({
        chatty: () => false,
        cameFor: (line) => (line.text.includes('会唱') ? 'can-sing' : undefined),
      }),
    );
    expect(targets.map((t) => [t.nickname, t.command])).toEqual([['小红', 'can-sing']]);
    expect(notes).toEqual([
      ['pick dropped: not about the bot, and no command', { text: '机器人在吗' }],
      ['pick handed to the command it came for', { text: '主播会唱晴天吗', command: 'can-sing' }],
    ]);
  });
});
