import { testWording } from '../../support/wording';
import {
  relevanceRequest,
  roomLines,
  scoreRelevance,
  type RoomLine,
} from '../../../src/core/chat/relevance';

test('one list of the room, with what the streamer read out marked, and only what may be about the bot to judge', () => {
  const lines = roomLines(
    [
      { ts: 1000, nickname: '阿明', content: '这机器人好笨啊' },
      { ts: 2000, nickname: '小助手', content: '@阿明 我才不笨' },
      { ts: 3000, nickname: '小红', content: '@小助手 你几岁' },
    ],
    [
      { start: 3000, end: 4000, text: '这机器人好笨啊哈哈哈', speech: 0.8 },
      { start: 4000, end: 5000, text: '我才不笨', speech: 0.8 },
      { start: 5000, end: 6000, text: '天青色等烟雨', speech: 0.05 },
    ],
    '小助手',
  );

  expect(lines.map(({ who, text, candidate }) => [who, text, candidate])).toEqual([
    ['阿明', '这机器人好笨啊', true],
    ['小助手', '@阿明 我才不笨', false],
    ['小红', '@小助手 你几岁', false],
    ['主播', '（念了阿明的弹幕）哈哈哈', true],
    // 我才不笨, the bot's own reply read out, is gone.
    ['主播', '（唱）天青色等烟雨', false],
  ]);
  const { state, questions } = relevanceRequest(
    lines.slice(0, 3),
    lines.slice(3, 4),
    '小助手',
    '一只猫',
    testWording,
  );
  expect(state).toContain('它的人设：一只猫。');
  expect(state).toMatch(/新内容：\n\(1\) \d\d:\d\d:04 \[主播\] （念了阿明的弹幕）哈哈哈$/);
  expect(Object.keys(questions)).toEqual(['q1']);
});

describe('scoring what the judge said', () => {
  const line = (text: string, userId?: string): RoomLine => ({
    ts: 1000,
    who: '阿明',
    ...(userId && { userId }),
    text,
    candidate: true,
  });
  const fresh = [line('机器人你好', 'u1'), line('主播会唱晴天吗', 'u2'), line('今晚吃火锅', 'u3')];
  const rules = { threshold: 0.6, topics: ['can_sing'], matched: () => [] };

  test('a line is about the bot, or for a tool, from the likeliest of its scores', () => {
    const { about, toBot, best, topics } = scoreRelevance(
      fresh,
      { q1: 0.9, q1t1: 0.1, q2: 0.2, q2t1: 0.8, q3: 0.1, q3t1: 0.3 },
      rules,
    );
    expect(about).toEqual([fresh[0], fresh[1]]);
    // Only the first is about the bot itself; the second is for the tool.
    expect(toBot).toEqual([fresh[0]]);
    expect(best).toEqual({ line: fresh[0], score: 0.9 });
    expect(topics.get(fresh[1]!)).toEqual(['can_sing']);
    expect(topics.has(fresh[0]!)).toBe(false);
  });

  test('a missing score is 0, and the earlier of equally likely lines is the best', () => {
    const { about, toBot, best } = scoreRelevance(fresh, { q2: 0.4, q3: 0.4 }, rules);
    expect(about).toEqual([]);
    expect(toBot).toEqual([]);
    expect(best).toEqual({ line: fresh[1], score: 0.4 });
  });

  test('a line matching a tool trigger is about it whatever the judge said', () => {
    const { about, toBot, topics } = scoreRelevance(
      fresh,
      { q2: 0.1 },
      { ...rules, matched: (l) => (l === fresh[1] ? ['can_sing'] : []) },
    );
    expect(about).toEqual([fresh[1]]);
    expect(toBot).toEqual([]);
    expect(topics.get(fresh[1]!)).toEqual(['can_sing']);
  });

  test('only the bot question counts without tools listening', () => {
    const { about } = scoreRelevance(fresh, { q1t1: 0.9, q3: 0.7 }, { ...rules, topics: [] });
    expect(about).toEqual([fresh[2]]);
  });

  test('a line scoring two topics has both, in the order asked, and one matched too is not doubled', () => {
    const two = { ...rules, topics: ['can_sing', 'schedule'] };
    const scored = scoreRelevance(
      fresh,
      { q2t1: 0.7, q2t2: 0.9, q3t2: 0.8, q1t1: 0.1 },
      { ...two, matched: (l) => (l === fresh[2] ? ['can_sing', 'schedule'] : []) },
    );
    expect(scored.topics.get(fresh[1]!)).toEqual(['can_sing', 'schedule']);
    expect(scored.topics.get(fresh[2]!)).toEqual(['schedule', 'can_sing']);
    expect(scored.topics.has(fresh[0]!)).toBe(false);
  });

  test('lines the judge is surer of than the sure threshold about the bot are sure, a tool’s score is not', () => {
    const scores = { q1: 0.95, q1t1: 0.1, q2: 0.2, q2t1: 0.99, q3: 0.9, q3t1: 0.3 };
    const { about, sure } = scoreRelevance(fresh, scores, { ...rules, sureThreshold: 0.9 });
    // Exactly at the threshold is not above it.
    expect(sure).toEqual([fresh[0]]);
    expect(about).toEqual([fresh[0], fresh[1], fresh[2]]);
    // Without the option none is sure.
    expect(scoreRelevance(fresh, scores, rules).sure).toEqual([]);
  });
});
