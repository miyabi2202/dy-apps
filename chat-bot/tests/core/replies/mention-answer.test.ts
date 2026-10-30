import { parseMentionAnswer } from '../../../src/core/replies/mention-answer';

test('an answer that is not JSON is the message itself', () => {
  expect(parseMentionAnswer('你好呀')).toEqual({ message: '你好呀', at: true });
});

test('reads the message', () => {
  expect(parseMentionAnswer(JSON.stringify({ message: '好的', others: [] }))).toEqual({
    message: '好的',
    at: true,
  });
});

test('JSON without a message is taken whole as the message', () => {
  const text = JSON.stringify({ others: [] });
  expect(parseMentionAnswer(text)).toEqual({ message: text, at: true });
});

test('at is false only when Claude says so: the reply then goes without the @', () => {
  const answer = (at: unknown) =>
    parseMentionAnswer(JSON.stringify({ message: '好', at, others: [] }));
  expect(answer(false).at).toBe(false);
  expect(answer(true).at).toBe(true);
  expect(answer('no').at).toBe(true);
});
