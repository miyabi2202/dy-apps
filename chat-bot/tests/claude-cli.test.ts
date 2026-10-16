import type { spawn } from 'node:child_process';
import { claudeCli, resultFrom, userMessage } from '../src/adapters/claude-cli';

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

test('pre-approves the web tools but not the file tools, which only reach the given folders', () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running claude');
  }) as unknown as typeof spawn;
  void claudeCli({ readDirs: ['/data/chat/1'], spawnProcess })({ prompt: 'hi' }).catch(() => {});

  const after = (flag: string) => args[args.indexOf(flag) + 1];
  expect(after('--tools')).toBe('WebSearch,WebFetch,Read,Glob,Grep');
  expect(after('--allowedTools')).toBe('WebSearch,WebFetch');
  expect(after('--add-dir')).toBe('/data/chat/1');
});
