import { resultFrom, userMessage } from '../src/claude';

test('sends the screenshot before the prompt', () => {
  const message = JSON.parse(
    userMessage({ prompt: '在讲什么', image: new Uint8Array([1, 2, 3]) }),
  ) as {
    message: { content: { type: string; text?: string; source?: { data: string } }[] };
  };
  expect(message.message.content).toEqual([
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AQID' } },
    { type: 'text', text: '在讲什么' },
  ]);
});

test('reads the answer from the result line, and fails on an error result', () => {
  const lines = (result: object) =>
    [JSON.stringify({ type: 'system', subtype: 'init' }), JSON.stringify(result)].join('\n');

  expect(resultFrom(lines({ type: 'result', subtype: 'success', result: ' 讲吕布 \n' }))).toBe(
    '讲吕布',
  );
  expect(() =>
    resultFrom(lines({ type: 'result', subtype: 'error_max_turns', is_error: true })),
  ).toThrow('error_max_turns');
  expect(() => resultFrom('')).toThrow('no result');
});
