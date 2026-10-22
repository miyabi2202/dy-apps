import { parseMentionAnswer } from '../../../src/core/replies/mention-answer';

test('an answer that is not JSON is the message itself', () => {
  expect(parseMentionAnswer('你好呀')).toEqual({ message: '你好呀', command: '', args: '' });
});

test('reads the message, and the command asked for without its slash', () => {
  expect(
    parseMentionAnswer(
      JSON.stringify({ message: '好的', command_request: '/自动谢礼', command_args: ' 100 ' }),
    ),
  ).toEqual({ message: '好的', command: '自动谢礼', args: '100' });
  expect(
    parseMentionAnswer(JSON.stringify({ message: '你好', command_request: '', command_args: '' })),
  ).toEqual({ message: '你好', command: '', args: '' });
});

test('JSON without a message is taken whole as the message', () => {
  const text = JSON.stringify({ command_request: '自动谢礼' });
  expect(parseMentionAnswer(text)).toEqual({ message: text, command: '', args: '' });
});
