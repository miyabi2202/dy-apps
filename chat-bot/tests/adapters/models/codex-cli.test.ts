import type { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { codexCli, codexResult } from '../../../src/adapters/models/codex-cli';

const events = (...lines: object[]) => lines.map((line) => JSON.stringify(line)).join('\n');

test('reads the last message, and fails on a failed turn or no message', () => {
  const message = (text: string) => ({
    type: 'item.completed',
    item: { type: 'agent_message', text },
  });
  expect(
    codexResult(
      events(
        { type: 'thread.started' },
        message('我先搜一下。'),
        { type: 'item.completed', item: { type: 'web_search' } },
        message(' 搜到了\n弹幕：ALWAYS / 中島美嘉 '),
        { type: 'turn.completed' },
      ),
    ),
  ).toBe('搜到了\n弹幕：ALWAYS / 中島美嘉');
  expect(() => codexResult(events({ type: 'turn.failed', error: { message: 'quota' } }))).toThrow(
    'codex failed: quota',
  );
  expect(() => codexResult(events({ type: 'turn.completed' }))).toThrow('no answer');
});

test("runs read-only without the user's config, searching live, with the model and effort", () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running codex');
  }) as unknown as typeof spawn;
  void codexCli({ model: 'gpt-6-luna', effort: 'low', systemPrompt: '你是机器人', spawnProcess })({
    prompt: '这是什么歌',
  }).catch(() => {});

  expect(args).toEqual(
    expect.arrayContaining([
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      'web_search="live"',
      'model_reasoning_effort="low"',
    ]),
  );
  expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only');
  expect(args[args.indexOf('--model') + 1]).toBe('gpt-6-luna');
  expect(args.at(-1)).toBe('你是机器人\n\n这是什么歌');
});

test('hands codex the answer schema in a file', () => {
  let schema = '';
  const spawnProcess = ((_command: string, args: readonly string[]) => {
    schema = readFileSync(args[args.indexOf('--output-schema') + 1] ?? '', 'utf8');
    throw new Error('not really running codex');
  }) as unknown as typeof spawn;
  void codexCli({ spawnProcess })({ prompt: 'hi', schema: { type: 'object' } }).catch(() => {});
  expect(schema).toBe('{"type":"object"}');
});

test('hands codex the screenshot in a file, before the prompt', () => {
  let args: readonly string[] = [];
  let image: Buffer = Buffer.from('');
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    image = readFileSync(a[a.indexOf('-i') + 1] ?? '');
    throw new Error('not really running codex');
  }) as unknown as typeof spawn;
  void codexCli({ spawnProcess })({ prompt: 'hi', image: new Uint8Array([0xff, 0xd8]) }).catch(
    () => {},
  );
  expect([...image]).toEqual([0xff, 0xd8]);
  expect(args.slice(-2)).toEqual(['--', 'hi']);

  void codexCli({ spawnProcess })({ prompt: 'hi' }).catch(() => {});
  expect(args).not.toContain('-i');
});

test('with a screenshot, starts the zoom server on it and approves only its tool; without one, neither', () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running codex');
  }) as unknown as typeof spawn;
  const ask = codexCli({ zoom: { command: '/bin/tsx', args: ['/app/zoom-mcp.ts'] }, spawnProcess });
  void ask({ prompt: 'hi', image: new Uint8Array([0xff, 0xd8]) }).catch(() => {});

  const image = args[args.indexOf('-i') + 1];
  expect(args).toContain('mcp_servers.zoom.command="/bin/tsx"');
  expect(args).toContain(`mcp_servers.zoom.args=${JSON.stringify(['/app/zoom-mcp.ts', image])}`);
  expect(args).toContain('mcp_servers.zoom.tools.zoom.approval_mode="approve"');

  void ask({ prompt: 'hi' }).catch(() => {});
  expect(args.some((arg) => arg.startsWith('mcp_servers.zoom'))).toBe(false);
});
