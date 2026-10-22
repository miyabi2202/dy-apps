import type { ToolContext } from '../app/ports';

/** One JSON-RPC message, as MCP sends them. */
export interface RpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

/** What a tool answers: text for Claude to read. */
export interface ToolResult {
  text: string;
  isError?: boolean;
}

/** A tool the bot offers Claude while it answers an @. */
export interface BotTool {
  name: string;
  /** Tells Claude when to call it, in Chinese like the prompts. */
  description: string;
  /** The JSON Schema of its arguments. */
  inputSchema: object;
  /** The bot command doing the same job; Claude also asking for it (`command_request`) is then ignored. */
  command?: string;
  /** Offered only when an admin (or the streamer) asks; anyone else's session doesn't have it. */
  adminOnly?: boolean;
  call(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * One question's tools: who it's for, the tools it may call (an admin-only one only for an admin),
 * what each tool answered (a tool runs at most once per
 * question, so a repeated call returns the first result, which caps what a slow one such as the
 * song search can cost), and the order they were called in.
 */
export interface Session {
  context: ToolContext;
  tools: readonly BotTool[];
  memo: Map<string, Promise<ToolResult>>;
  used: string[];
}

export const newSession = (context: ToolContext, tools: readonly BotTool[]): Session => ({
  context,
  tools: tools.filter((tool) => !tool.adminOnly || context.admin === true),
  memo: new Map(),
  used: [],
});

const PROTOCOL_VERSION = '2025-06-18';

const reply = (id: RpcMessage['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const textResult = (result: ToolResult) =>
  ({
    content: [{ type: 'text', text: result.text }],
    ...(result.isError ? { isError: true } : {}),
  }) as const;

/**
 * Answers one MCP message for `session` (null for a notification, which gets none): the
 * JSON-RPC part of the server, apart from HTTP so it can be tested on its own. Only the session's
 * tools are listed or run, so a tool kept from the asker is unknown to them. A tool that throws is
 * an error result Claude can read, not a failed request.
 */
export async function handleRpc(message: RpcMessage, session: Session): Promise<object | null> {
  const { id, method, params = {} } = message;
  const { tools } = session;
  if (id === undefined) return null;
  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: (params.protocolVersion as string | undefined) ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'bot', version: '1.0.0' },
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) return reply(id, textResult({ text: `没有这个工具：${name}`, isError: true }));
      let result = session.memo.get(name);
      if (!result) {
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        result = tool
          .call(args, session.context)
          .catch((): ToolResult => ({ text: `${name} 这次没成功`, isError: true }));
        session.memo.set(name, result);
        session.used.push(name);
      }
      return reply(id, textResult(await result));
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } };
  }
}
