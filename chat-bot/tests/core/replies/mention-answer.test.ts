import { parseMentionAnswer } from '../../../src/core/replies/mention-answer';

test('an answer that is not JSON is the message itself', () => {
  expect(parseMentionAnswer('你好呀')).toEqual({ message: '你好呀' });
});

test('reads the message', () => {
  expect(parseMentionAnswer(JSON.stringify({ message: '好的', others: [] }))).toEqual({
    message: '好的',
  });
});

test('JSON without a message is taken whole as the message', () => {
  const text = JSON.stringify({ others: [] });
  expect(parseMentionAnswer(text)).toEqual({ message: text });
});
