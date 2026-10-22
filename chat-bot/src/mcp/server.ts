import { randomBytes } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BotTools, Log, ToolAccess, ToolContext, ToolSession } from '../app/ports';
import { handleRpc, newSession, type BotTool, type RpcMessage, type Session } from './rpc';

export interface BotMcpServerOptions {
  tools: readonly BotTool[];
  log: Log;
  /** 0 (the default) lets the OS pick a free one, so it never clashes with room-feed, the speech service or another bot. */
  port?: number;
  /** A fresh secret for each question. */
  newToken?: () => string;
  createServer?: typeof createHttpServer;
}

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
 * The bot's tools for Claude, as an MCP server inside the bot process: streamable HTTP with JSON
 * responses only, stateless, on 127.0.0.1. A question opens a session (`open`) with a token of its
 * own that Claude sends as a bearer header, and closes it when the answer is done, so the tools
 * work only while the bot is answering that question. A request must come to `127.0.0.1` or
 * `localhost` and carry no `Origin` (a browser's), which keeps web pages and DNS rebinding out.
 */
export class BotMcpServer implements BotTools {
  private server: Server | undefined;
  private port = 0;
  private readonly sessions = new Map<string, Session>();
  private readonly tools: readonly BotTool[];

  constructor(private readonly options: BotMcpServerOptions) {
    // Each call logged with who it was for and how long it took.
    this.tools = options.tools.map((tool) => ({
      ...tool,
      call: async (args: Record<string, unknown>, context: ToolContext) => {
        const start = Date.now();
        const log = (isError: boolean) =>
          options.log.info('mcp tool', {
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
    }));
  }

  async start(): Promise<void> {
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
    const server = this.server;
    this.server = undefined;
    this.sessions.clear();
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  /** A session for one question, or null while the server isn't running. */
  open(context: ToolContext): ToolSession | null {
    if (!this.server) return null;
    const token = (this.options.newToken ?? (() => randomBytes(24).toString('base64url')))();
    const session = newSession(context);
    this.sessions.set(token, session);
    const access: ToolAccess = {
      url: `http://127.0.0.1:${this.port}/mcp`,
      token,
      tools: this.tools.map((tool) => tool.name),
    };
    return {
      access,
      used: () => [...session.used],
      replaces: (command) =>
        session.used.some(
          (name) => this.tools.find((tool) => tool.name === name)?.command === command,
        ),
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
    if (Array.isArray(body)) {
      const answers = (
        await Promise.all(messages.map((m) => handleRpc(m as RpcMessage, this.tools, session)))
      ).filter((answer) => answer !== null);
      return answers.length ? send(200, answers) : send(202);
    }
    const answer = await handleRpc(body as RpcMessage, this.tools, session);
    return answer ? send(200, answer) : send(202);
  }
}
