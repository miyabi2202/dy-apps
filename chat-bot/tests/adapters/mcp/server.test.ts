import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { BotTool, ToolSession } from '../../../src/core/tools/bot-tool';
import { BotMcpServer } from '../../../src/adapters/mcp/server';
import { silentLog } from '../../support/fakes';

const tool: BotTool = {
  name: 'identify_song',
  description: '认歌',
  inputSchema: { type: 'object' },
  commands: [{ name: '识歌', parse: () => ({ args: {} }), say: () => '' }],
  call: (_args, { asker }) => Promise.resolve({ text: `给 ${asker} 认了歌` }),
};

const servers: BotMcpServer[] = [];
async function started() {
  const logged: [string, object | undefined][] = [];
  const server = new BotMcpServer({
    tools: () => [tool],
    log: { ...silentLog, info: (message, meta) => void logged.push([message, meta]) },
  });
  servers.push(server);
  await server.start();
  return { server, logged };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

const rpc = (message: object) => JSON.stringify({ jsonrpc: '2.0', ...message });
const post = (session: ToolSession, body: string, headers: Record<string, string> = {}) =>
  fetch(session.access.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${session.access.token}`,
      ...headers,
    },
    body,
  });

const clients: Client[] = [];
/** The SDK's client as Claude would be: the session's URL and bearer token. */
async function connect(session: ToolSession): Promise<Client> {
  const client = new Client({ name: 'test', version: '1' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(session.access.url), {
      requestInit: { headers: { Authorization: `Bearer ${session.access.token}` } },
    }),
  );
  return client;
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

/** A request with exactly these headers, which `fetch` won't send (Host, Origin). */
function raw(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end('{}');
  });
}

test('is closed before it starts and after it stops', async () => {
  const server = new BotMcpServer({ tools: () => [tool], log: silentLog });
  expect(server.open({ asker: 'a', question: '' })).toBeNull();
  await server.start();
  servers.push(server);
  expect(server.open({ asker: 'a', question: '' })).not.toBeNull();
  await server.stop();
  expect(server.open({ asker: 'a', question: '' })).toBeNull();
});

test('a tools/call round trip over loopback, logged, and the session knows what Claude used', async () => {
  const { server, logged } = await started();
  const session = server.open({ asker: '苦***', userId: '111111-苦***-31', question: '什么歌' })!;
  expect(session.access.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  expect(session.access.tools).toEqual(['identify_song']);

  const client = await connect(session);
  expect(await client.callTool({ name: 'identify_song', arguments: {} })).toMatchObject({
    content: [{ type: 'text', text: '给 苦*** 认了歌' }],
  });
  expect(session.used()).toEqual(['identify_song']);
  expect(session.calls().map(({ tool, isError }) => ({ tool, isError }))).toEqual([
    { tool: 'identify_song', isError: false },
  ]);
  expect(logged.find(([m]) => m === 'mcp tool')?.[1]).toMatchObject({
    tool: 'identify_song',
    asker: '苦***',
    userId: '111111-苦***-31',
    isError: false,
  });
});

test('initialize names the server and offers tools; a client lists them with their schemas', async () => {
  const { server } = await started();
  const client = await connect(server.open({ asker: 'a', question: '' })!);
  expect(client.getServerVersion()).toMatchObject({ name: 'bot' });
  expect(client.getServerCapabilities()).toMatchObject({ tools: {} });
  expect((await client.listTools()).tools).toEqual([
    { name: 'identify_song', description: '认歌', inputSchema: { type: 'object' } },
  ]);
});

test('a notification gets 202, a ping is answered, and an unknown method is -32601', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  expect((await post(session, rpc({ method: 'notifications/initialized' }))).status).toBe(202);
  expect(await (await post(session, rpc({ id: 1, method: 'ping' }))).json()).toMatchObject({
    id: 1,
    result: {},
  });
  const unknown = await post(session, rpc({ id: 2, method: 'resources/list' }));
  expect(await unknown.json()).toMatchObject({ id: 2, error: { code: -32601 } });
});

test('a call runs the tool once per question: a repeat gets the first result, with the time it took', async () => {
  let n = 0;
  let clock = 1000;
  const counting: BotTool = { ...tool, call: () => Promise.resolve({ text: `第 ${++n} 次` }) };
  const server = new BotMcpServer({
    tools: () => [counting],
    log: silentLog,
    now: () => (clock += 250),
  });
  servers.push(server);
  await server.start();
  const session = server.open({ asker: 'a', question: '' })!;
  const client = await connect(session);
  const call = () => client.callTool({ name: 'identify_song', arguments: { hint: '嗯' } });
  expect(await call()).toMatchObject({ content: [{ type: 'text', text: '第 1 次' }] });
  expect(await call()).toMatchObject({ content: [{ type: 'text', text: '第 1 次' }] });
  expect(session.used()).toEqual(['identify_song']);
  expect(session.calls()).toEqual([{ tool: 'identify_song', ms: 250, isError: false }]);
});

test('an unknown tool, or one that throws, is an error result Claude can read', async () => {
  const broken: BotTool = {
    ...tool,
    name: 'broken',
    call: () => Promise.reject(new Error('boom')),
  };
  const server = new BotMcpServer({ tools: () => [tool, broken], log: silentLog });
  servers.push(server);
  await server.start();
  const session = server.open({ asker: 'a', question: '' })!;
  const client = await connect(session);
  const unknown = await client.callTool({ name: 'nope' });
  expect(unknown).toMatchObject({ isError: true });
  expect(JSON.stringify(unknown)).toContain('nope');
  expect(await client.callTool({ name: 'broken' })).toMatchObject({ isError: true });
  expect(session.calls()).toMatchObject([{ tool: 'broken', isError: true }]);
});

test('a tool its setting switches off is neither listed nor run while it is off', async () => {
  let on = false;
  const ran: string[] = [];
  const happy: BotTool = {
    ...tool,
    name: 'send_happy_heart',
    offered: () => on,
    call: () => {
      ran.push('send_happy_heart');
      return Promise.resolve({ text: 'ok' });
    },
  };
  const server = new BotMcpServer({ tools: () => [happy], log: silentLog });
  servers.push(server);
  await server.start();
  const off = server.open({ asker: 'a', question: '', admin: true })!;
  expect(off.access.tools).toEqual([]);
  expect(await (await connect(off)).callTool({ name: 'send_happy_heart' })).toMatchObject({
    isError: true,
  });
  expect(ran).toEqual([]);
  on = true;
  expect(server.open({ asker: 'a', question: '' })!.access.tools).toEqual(['send_happy_heart']);
});

test('401 without a token, with a wrong one, and once the question is over', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  const body = rpc({ id: 1, method: 'ping' });
  expect((await fetch(session.access.url, { method: 'POST', body })).status).toBe(401);
  expect(
    (
      await fetch(session.access.url, {
        method: 'POST',
        body,
        headers: { Authorization: 'Bearer x' },
      })
    ).status,
  ).toBe(401);
  expect((await post(session, body)).status).toBe(200);
  session.close();
  expect((await post(session, body)).status).toBe(401);
});

test('refuses a browser (Origin) and a Host that is not loopback, and answers GET with 405', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  const { port } = new URL(session.access.url);
  const auth = { Authorization: `Bearer ${session.access.token}` };

  expect(
    (await post(session, rpc({ id: 1, method: 'ping' }), { Origin: 'http://evil.test' })).status,
  ).toBe(403);
  expect(await raw(session.access.url, { ...auth, Host: 'evil.test' })).toBe(403);
  expect(
    await raw(session.access.url, {
      ...auth,
      Host: `localhost:${port}`,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    }),
  ).toBe(400);
  const get = await fetch(session.access.url, { headers: auth });
  expect(get.status).toBe(405);
});

test('a body over 1 MB is a 413', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  const big = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'ping',
    pad: 'x'.repeat(1024 * 1024),
  });
  const status = await post(session, big).then(
    (response) => response.status,
    () => 413, // the server may hang up while the client is still sending
  );
  expect(status).toBe(413);
});

test('a body that is not JSON is a 400, not a crash', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  expect((await post(session, 'not json')).status).toBe(400);
  expect((await post(session, 'null')).status).toBe(400);
});

test('a non-admin’s session leaves out the admin-only tools, and cannot call them', async () => {
  const server = new BotMcpServer({
    tools: () => [tool, { ...tool, name: 'set_threshold', adminOnly: true }],
    log: silentLog,
  });
  servers.push(server);
  await server.start();

  expect(server.open({ asker: 'a', question: '' })!.access.tools).toEqual(['identify_song']);
  const admin = server.open({ asker: 'a', question: '', admin: true })!;
  expect(admin.access.tools).toEqual(['identify_song', 'set_threshold']);

  const refused = await (
    await connect(server.open({ asker: 'a', question: '' })!)
  ).callTool({
    name: 'set_threshold',
  });
  expect(refused).toMatchObject({ isError: true });
  const client = await connect(admin);
  expect((await client.listTools()).tools.map(({ name }) => name)).toEqual([
    'identify_song',
    'set_threshold',
  ]);
});
