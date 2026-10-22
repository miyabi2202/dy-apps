import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { claudeCli } from '../../../src/adapters/models/claude-cli';

type McpConfig = {
  mcpServers: Record<
    string,
    { command?: string; args?: string[]; type?: string; url?: string; headers?: object }
  >;
};

/** A spawn that records the arguments and the config file at that moment, then fails to start. */
function peek() {
  const seen: { args: readonly string[]; config?: McpConfig; configPath?: string } = { args: [] };
  const spawnProcess = ((_command: string, args: readonly string[]) => {
    seen.args = args;
    const at = args.indexOf('--mcp-config');
    if (at >= 0) {
      seen.configPath = args[at + 1]!;
      seen.config = JSON.parse(readFileSync(seen.configPath, 'utf8')) as McpConfig;
    }
    throw new Error('not really running claude');
  }) as unknown as typeof spawn;
  const after = (flag: string) => seen.args[seen.args.indexOf(flag) + 1];
  return { seen, spawnProcess, after };
}

const botTools = {
  url: 'http://127.0.0.1:5555/mcp',
  token: 'secret',
  tools: ['identify_song', 'identify_bgm'],
};

test('botTools become an http MCP server with the bearer token, and its tools are pre-approved', () => {
  const { seen, spawnProcess, after } = peek();
  void claudeCli({ spawnProcess })({ prompt: 'hi', botTools }).catch(() => {});

  expect(seen.config).toEqual({
    mcpServers: {
      bot: {
        type: 'http',
        url: 'http://127.0.0.1:5555/mcp',
        headers: { Authorization: 'Bearer secret' },
      },
    },
  });
  expect(after('--allowedTools')).toBe(
    'WebSearch,WebFetch,mcp__bot__identify_song,mcp__bot__identify_bgm',
  );
  expect(seen.args).toContain('--strict-mcp-config');
  // Only the one question's config; it is removed when the run is over.
  expect(existsSync(seen.configPath!)).toBe(false);
});

test('with a screenshot too, zoom and the bot are both there', () => {
  const { seen, spawnProcess, after } = peek();
  const zoom = { command: '/bin/tsx', args: ['/app/zoom-mcp.ts'] };
  void claudeCli({ zoom, spawnProcess })({
    prompt: 'hi',
    image: new Uint8Array([0xff, 0xd8]),
    botTools,
  }).catch(() => {});

  expect(Object.keys(seen.config!.mcpServers).sort()).toEqual(['bot', 'zoom']);
  expect(after('--allowedTools')).toBe(
    'WebSearch,WebFetch,mcp__zoom__zoom,mcp__bot__identify_song,mcp__bot__identify_bgm',
  );
});

test('without botTools or a screenshot there is no MCP config', () => {
  const { seen, spawnProcess } = peek();
  void claudeCli({ spawnProcess })({ prompt: 'hi' }).catch(() => {});
  expect(seen.args).not.toContain('--mcp-config');
});

test("a question's timeoutMs replaces the adapter's", async () => {
  jest.useFakeTimers();
  try {
    let killed = false;
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { end: () => {} },
      kill: () => void (killed = true),
    });
    const spawnProcess = (() => child) as unknown as typeof spawn;
    const answer = claudeCli({ timeoutMs: 1000, spawnProcess })({ prompt: 'hi', timeoutMs: 5000 });
    const outcome = answer.then(
      () => 'answered',
      (err: Error) => err.message,
    );
    jest.advanceTimersByTime(1500);
    expect(killed).toBe(false);
    jest.advanceTimersByTime(4000);
    expect(await outcome).toBe('claude timed out after 5000 ms');
    expect(killed).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
