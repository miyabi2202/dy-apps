import { randomBytes } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as McpSdkServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { newSession, type Session } from './session';
import type { BotTools, Log } from '../../app/ports';
import type {
  BotTool,
  ToolAccess,
  ToolContext,
  ToolResult,
  ToolSession,
} from '../../core/tools/bot-tool';

export interface BotMcpServerOptions {
  /** The bot's tools as they are now: a room's own change with its files, so each session reads them again. */
  tools: () => readonly BotTool[];
  log: Log;
  /** 0 (the default) lets the OS pick a free one, so it never clashes with room-feed, the speech service or another bot. */
  port?: number;
  /** A fresh secret for each question. */
  newToken?: () => string;
  createServer?: typeof createHttpServer;
  /** The clock for how long a call took. */
  now?: () => number;
}

const textResult = (result: ToolResult) => ({
  content: [{ type: 'text' as const, text: result.text }],
  ...(result.isError ? { isError: true } : {}),
});

/** Requests are small JSON; more than this is refused. */
const MAX_BODY = 1024 * 1024;

class TooLarge extends Error {}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new TooLarge());
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

/**
 * The bot's tools for Claude, as an MCP server inside the bot process: the official SDK's `Server`
 * and `StreamableHTTPServerTransport` (stateless, JSON responses only) on 127.0.0.1, behind our
 * own checks, which the SDK doesn't know. A question opens a session (`open`) with a token of its
 * own that Claude sends as a bearer header, and closes it when the answer is done, so the tools
 * work only while the bot is answering that question, and offer an admin-only tool only when an
 * admin asked. A request must come to `127.0.0.1` or
 * `localhost` and carry no `Origin` (a browser's), which keeps web pages and DNS rebinding out.
 */
export class BotMcpServer implements BotTools {
  private server: Server | undefined;
  private port = 0;
  private readonly sessions = new Map<string, Session>();
  /** The start in progress, which a stop waits for so a server that is still opening isn't left running. */
  private starting: Promise<void> | undefined;

  constructor(private readonly options: BotMcpServerOptions) {}

  start(): Promise<void> {
    this.starting = this.listen();
    return this.starting;
  }

  private async listen(): Promise<void> {
    const server = (this.options.createServer ?? createHttpServer)((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port ?? 0, '127.0.0.1', () => resolve());
    });
    this.port = (server.address() as AddressInfo).port;
    this.server = server;
    this.options.log.info('mcp server listening', { port: this.port });
  }

  async stop(): Promise<void> {
    await this.starting?.catch(() => {});
    const server = this.server;
    this.server = undefined;
    this.sessions.clear();
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  /** Each call logged with who it was for and how long it took. */
  private logged(tool: BotTool): BotTool {
    return {
      ...tool,
      call: async (args: Record<string, unknown>, context: ToolContext) => {
        const start = Date.now();
        const log = (isError: boolean) =>
          this.options.log.info('mcp tool', {
            tool: tool.name,
            asker: context.asker,
            userId: context.userId,
            ms: Date.now() - start,
            isError,
          });
        try {
          const result = await tool.call(args, context);
          log(result.isError === true);
          return result;
        } catch (err) {
          log(true);
          throw err;
        }
      },
    };
  }

  /** A session for one question, or null while the server isn't running. */
  open(context: ToolContext): ToolSession | null {
    if (!this.server) return null;
    const token = (this.options.newToken ?? (() => randomBytes(24).toString('base64url')))();
    const session = newSession(
      context,
      this.options.tools().map((tool) => this.logged(tool)),
    );
    this.sessions.set(token, session);
    const access: ToolAccess = {
      url: `http://127.0.0.1:${this.port}/mcp`,
      token,
      tools: session.tools.map((tool) => tool.name),
    };
    return {
      access,
      used: () => [...session.used],
      calls: () => [...session.calls],
      close: () => void this.sessions.delete(token),
    };
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const send = (status: number, body?: object, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      response.end(body ? JSON.stringify(body) : undefined);
    };
    const host = request.headers.host;
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return send(403);
    if (request.headers.origin !== undefined) return send(403);
    if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return send(404);
    const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
    const session = bearer ? this.sessions.get(bearer) : undefined;
    if (!session) return send(401, undefined, { 'WWW-Authenticate': 'Bearer' });
    if (request.method !== 'POST') return send(405, undefined, { Allow: 'POST' });

    let body: unknown;
    try {
      body = JSON.parse(await readBody(request));
    } catch (err) {
      if (err instanceof TooLarge) return send(413);
      return send(400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'parse error' },
      });
    }
    const messages = Array.isArray(body) ? body : [body];
    if (!messages.every((m) => typeof m === 'object' && m !== null)) {
      return send(400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'invalid request' },
      });
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const mcp = this.mcpServer(session);
    response.on('close', () => void mcp.close());
    await mcp.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  /** The SDK's server for one request: only the session's tools are listed or run, so an admin-only tool is unknown to anyone else. */
  private mcpServer(session: Session): McpSdkServer {
    const mcp = new McpSdkServer(
      { name: 'bot', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    mcp.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: session.tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema: inputSchema as { type: 'object' },
      })),
    }));
    mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const { name } = params;
      const tool = session.tools.find((candidate) => candidate.name === name);
      if (!tool) return textResult({ text: `没有这个工具：${name}`, isError: true });
      let result = session.memo.get(name);
      if (!result) {
        const now = this.options.now ?? Date.now;
        const start = now();
        result = tool
          .call(params.arguments ?? {}, session.context)
          .catch((): ToolResult => ({ text: `${name} 这次没成功`, isError: true }))
          .then((settled) => {
            session.calls.push({
              tool: name,
              ms: now() - start,
              isError: settled.isError === true,
              ...(settled.silent && { silent: true }),
              ...(settled.say !== undefined && { say: settled.say }),
            });
            return settled;
          });
        session.memo.set(name, result);
        session.used.push(name);
      }
      return textResult(await result);
    });
    return mcp;
  }
}
