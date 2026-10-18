import type { spawn } from 'node:child_process';
import { agyCli, agyResult } from '../src/adapters/agy-cli';

test('reads the response, and fails on any other status', () => {
  expect(agyResult(JSON.stringify({ status: 'SUCCESS', response: ' 东京\n弹幕：东京\n' }))).toBe(
    '东京\n弹幕：东京',
  );
  expect(() => agyResult(JSON.stringify({ status: 'ERROR', error: 'quota' }))).toThrow(
    'agy failed (ERROR): quota',
  );
  expect(() => agyResult('')).toThrow('no result');
});

test('runs sandboxed with the system prompt before the question, and the given model', () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running agy');
  }) as unknown as typeof spawn;
  void agyCli({ model: 'gemini-3.8-flash-high', systemPrompt: '你是机器人', spawnProcess })({
    prompt: '这是什么歌',
  }).catch(() => {});

  expect(args[1]).toBe('你是机器人\n\n这是什么歌');
  expect(args).toEqual(expect.arrayContaining(['--sandbox', '--disable-slash-commands']));
  expect(args[args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
});
