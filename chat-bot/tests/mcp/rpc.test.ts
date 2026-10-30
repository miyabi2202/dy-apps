import type { BotTool } from '../../src/app/ports';
import { handleRpc, newSession } from '../../src/mcp/rpc';

function setup() {
  const calls: { args: Record<string, unknown>; asker: string; userId?: string }[] = [];
  const tool: BotTool = {
    name: 'identify_song',
    description: '认歌',
    inputSchema: { type: 'object', properties: {} },
    call: (args, { asker, userId }) => {
      calls.push({ args, asker, userId });
      return Promise.resolve({ text: `第 ${calls.length} 次` });
    },
  };
  let now = 1000;
  const session = newSession(
    { asker: '苦***', userId: '111111-苦***-31', question: '这是什么歌' },
    [tool],
    () => (now += 250),
  );
  const rpc = (message: object) =>
    handleRpc({ jsonrpc: '2.0', ...message }, session) as Promise<{
      result?: { content?: { text: string }[]; isError?: boolean; [key: string]: unknown };
      error?: { code: number };
    }>;
  return { rpc, calls, session };
}

test('initialize echoes the client protocol version; notifications get no answer', async () => {
  const { rpc } = setup();
  const answer = await rpc({
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26' },
  });
  expect(answer.result).toMatchObject({
    protocolVersion: '2025-03-26',
    capabilities: { tools: {} },
  });
  expect(await rpc({ method: 'notifications/initialized' })).toBeNull();
});

test('lists its tools with their descriptions and schemas', async () => {
  const { rpc } = setup();
  const answer = await rpc({ id: 2, method: 'tools/list' });
  expect(answer.result?.tools).toEqual([
    { name: 'identify_song', description: '认歌', inputSchema: { type: 'object', properties: {} } },
  ]);
});

test('a call runs the tool with the question’s context, once: a repeat gets the first result', async () => {
  const { rpc, calls, session } = setup();
  const call = (id: number) =>
    rpc({ id, method: 'tools/call', params: { name: 'identify_song', arguments: { hint: '嗯' } } });

  expect((await call(3)).result?.content).toEqual([{ type: 'text', text: '第 1 次' }]);
  expect((await call(4)).result?.content).toEqual([{ type: 'text', text: '第 1 次' }]);
  expect(calls).toEqual([{ args: { hint: '嗯' }, asker: '苦***', userId: '111111-苦***-31' }]);
  expect(session.used).toEqual(['identify_song']);
  expect(session.calls).toEqual([{ tool: 'identify_song', ms: 250, isError: false }]);
});

test('an unknown tool is an error result Claude can read; an unknown method is -32601', async () => {
  const { rpc } = setup();
  const unknown = await rpc({ id: 5, method: 'tools/call', params: { name: 'nope' } });
  expect(unknown.result).toMatchObject({ isError: true });
  expect(unknown.result?.content?.[0]?.text).toContain('nope');
  expect((await rpc({ id: 6, method: 'resources/list' })).error?.code).toBe(-32601);
});

test('a tool that throws is an error result, not a failed request', async () => {
  const broken: BotTool = {
    name: 'broken',
    description: '',
    inputSchema: {},
    call: () => Promise.reject(new Error('boom')),
  };
  const answer = (await handleRpc(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'broken' } },
    newSession({ asker: 'a', question: '' }, [broken]),
  )) as { result: { isError: boolean } };
  expect(answer.result.isError).toBe(true);
});

test('an admin-only tool is listed and run only in an admin’s session', async () => {
  const ran: string[] = [];
  const tool = (name: string, adminOnly?: boolean): BotTool => ({
    name,
    description: '',
    inputSchema: {},
    ...(adminOnly && { adminOnly }),
    call: () => {
      ran.push(name);
      return Promise.resolve({ text: 'ok' });
    },
  });
  const tools = [tool('identify_song'), tool('set_threshold', true)];
  const list = async (admin?: boolean) => {
    const answer = (await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      newSession({ asker: 'a', question: '', admin }, tools),
    )) as { result: { tools: { name: string }[] } };
    return answer.result.tools.map(({ name }) => name);
  };
  expect(await list()).toEqual(['identify_song']);
  expect(await list(false)).toEqual(['identify_song']);
  expect(await list(true)).toEqual(['identify_song', 'set_threshold']);

  const refused = (await handleRpc(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'set_threshold' } },
    newSession({ asker: 'a', question: '' }, tools),
  )) as { result: { isError: boolean } };
  expect(refused.result.isError).toBe(true);
  expect(ran).toEqual([]);
});

test('a tool its setting switches off is neither listed nor run, for anyone, while it is off', async () => {
  let on = false;
  const ran: string[] = [];
  const happy: BotTool = {
    name: 'send_happy_heart',
    description: '',
    inputSchema: {},
    offered: () => on,
    call: () => {
      ran.push('send_happy_heart');
      return Promise.resolve({ text: 'ok' });
    },
  };
  const names = async () => {
    const answer = (await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      newSession({ asker: 'a', question: '', admin: true }, [happy]),
    )) as { result: { tools: { name: string }[] } };
    return answer.result.tools.map(({ name }) => name);
  };
  expect(await names()).toEqual([]);
  await handleRpc(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'send_happy_heart' } },
    newSession({ asker: 'a', question: '', admin: true }, [happy]),
  );
  expect(ran).toEqual([]);
  on = true;
  expect(await names()).toEqual(['send_happy_heart']);
});
