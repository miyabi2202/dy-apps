import { request } from 'node:http';
import type { BotTool, ToolSession } from '../../src/app/ports';
import { BotMcpServer } from '../../src/mcp/server';
import { silentLog } from '../support/fakes';

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
      Authorization: `Bearer ${session.access.token}`,
      ...headers,
    },
    body,
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

  const response = await post(
    session,
    rpc({ id: 1, method: 'tools/call', params: { name: 'identify_song', arguments: {} } }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    result: { content: [{ type: 'text', text: '给 苦*** 认了歌' }] },
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

test('a notification gets 202, and a batch is answered together', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  expect((await post(session, rpc({ method: 'notifications/initialized' }))).status).toBe(202);
  const batch = await post(
    session,
    `[${rpc({ id: 1, method: 'ping' })},${rpc({ method: 'notifications/initialized' })},${rpc({ id: 2, method: 'tools/list' })}]`,
  );
  const answers = (await batch.json()) as { id: number }[];
  expect(answers.map((a) => a.id)).toEqual([1, 2]);
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
  expect(await raw(session.access.url, { ...auth, Host: `localhost:${port}` })).toBe(202);
  const get = await fetch(session.access.url, { headers: auth });
  expect(get.status).toBe(405);
});

test('a body that is not JSON is a 400, not a crash', async () => {
  const { server } = await started();
  const session = server.open({ asker: 'a', question: '' })!;
  expect((await post(session, 'not json')).status).toBe(400);
  expect((await post(session, 'null')).status).toBe(400);
});

test('a non-admin’s session leaves out the admin-only tools', async () => {
  const server = new BotMcpServer({
    tools: () => [tool, { ...tool, name: 'set_threshold', adminOnly: true }],
    log: silentLog,
  });
  servers.push(server);
  await server.start();

  expect(server.open({ asker: 'a', question: '' })!.access.tools).toEqual(['identify_song']);
  const admin = server.open({ asker: 'a', question: '', admin: true })!;
  expect(admin.access.tools).toEqual(['identify_song', 'set_threshold']);
});
