import { existsSync, readFileSync } from 'node:fs';
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

test('a question can narrow the tools (no folders without file tools) and cap the turns', () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running claude');
  }) as unknown as typeof spawn;
  const ask = claudeCli({ readDirs: ['/data/chat/1'], spawnProcess });
  void ask({ prompt: 'hi', tools: ['WebSearch', 'WebFetch'], maxTurns: 12 }).catch(() => {});

  const after = (flag: string) => args[args.indexOf(flag) + 1];
  expect(after('--tools')).toBe('WebSearch,WebFetch');
  expect(args).not.toContain('--add-dir');
  expect(after('--max-turns')).toBe('12');

  void ask({ prompt: 'hi' }).catch(() => {});
  expect(args).not.toContain('--max-turns');
  expect(args).not.toContain('--effort');
  void claudeCli({ effort: 'high', spawnProcess })({ prompt: 'hi' }).catch(() => {});
  expect(after('--effort')).toBe('high');

  void ask({ prompt: 'hi', schema: { type: 'object' } }).catch(() => {});
  expect(after('--json-schema')).toBe('{"type":"object"}');
});

test('with a screenshot, starts the zoom server on it and allows its tool; without one, neither', () => {
  let args: readonly string[] = [];
  const spawnProcess = ((_command: string, a: readonly string[]) => {
    args = a;
    throw new Error('not really running claude');
  }) as unknown as typeof spawn;
  const zoom = { command: '/bin/tsx', args: ['/app/zoom-mcp.ts'] };
  const ask = claudeCli({ zoom, spawnProcess });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  let config = '';
  const peek = ((_command: string, a: readonly string[]) => {
    args = a;
    config = readFileSync(a[a.indexOf('--mcp-config') + 1]!, 'utf8');
    throw new Error('not really running claude');
  }) as unknown as typeof spawn;
  void claudeCli({ zoom, spawnProcess: peek })({
    prompt: 'hi',
    image: new Uint8Array([0xff, 0xd8]),
  }).catch(() => {});
  const server = (
    JSON.parse(config) as { mcpServers: { zoom: { command: string; args: string[] } } }
  ).mcpServers.zoom;
  expect(server.command).toBe('/bin/tsx');
  expect(server.args[0]).toBe('/app/zoom-mcp.ts');
  // The screenshot and config are removed once claude is done (here, failed to start).
  expect(existsSync(server.args[1]!)).toBe(false);
  expect(after('--allowedTools')).toBe('WebSearch,WebFetch,mcp__zoom__zoom');

  void ask({ prompt: 'hi' }).catch(() => {});
  expect(args).not.toContain('--mcp-config');
  expect(after('--allowedTools')).toBe('WebSearch,WebFetch');
});
