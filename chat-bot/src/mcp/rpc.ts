import type { ToolCall, ToolContext } from '../app/ports';
import type { ToolListen } from '../core/chat/relevance';

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

/** A `/` command that calls a tool directly, with no model, as `@机器人/自动谢礼 100` does. */
export interface ToolCommand {
  /** The name typed after the slash: 自动谢礼. */
  name: string;
  /**
   * The text after the name as the tool's arguments, or `usage`, what to say back when it isn't
   * right (「阈值要写成钻石数，用法：/自动谢礼 100」).
   */
  parse(args: string): { args: Record<string, unknown> } | { usage: string };
  /**
   * What the bot says back to the asker for a typed `/`, from the tool's result (JSON written for
   * Claude) and the arguments; empty for nothing (the tool spoke for itself).
   */
  say(result: ToolResult, args: Record<string, unknown>): string;
}

/** A tool the bot offers Claude while it answers an @. */
export interface BotTool {
  name: string;
  /** Tells Claude when to call it, in Chinese like the prompts. */
  description: string;
  /** The JSON Schema of its arguments. */
  inputSchema: object;
  /** Offered only when an admin (or the streamer) asks; anyone else's session doesn't have it. */
  adminOnly?: boolean;
  /** The `/` commands that call it directly, typed after an @ of the bot; usually one, none for a tool only Claude calls. */
  commands?: readonly ToolCommand[];
  /**
   * What it listens for in the room without an @: `when` is the question Jev scores each new line
   * by, and `trigger` / `mentioned` make auto-reply look at once. The picker is told the topic, and
   * a line that matched reaches Claude with a hint naming this tool.
   */
  listen?: ToolListen;
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
  /** What each call took, for the log; `used` is only the names. */
  calls: ToolCall[];
  now: () => number;
}

export const newSession = (
  context: ToolContext,
  tools: readonly BotTool[],
  now: () => number = Date.now,
): Session => ({
  context,
  tools: tools.filter((tool) => !tool.adminOnly || context.admin === true),
  memo: new Map(),
  used: [],
  calls: [],
  now,
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
 * tools are listed or run, so an admin-only tool is unknown to anyone else. A tool that throws is
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
        const start = session.now();
        result = tool
          .call(args, session.context)
          .catch((): ToolResult => ({ text: `${name} 这次没成功`, isError: true }))
          .then((settled) => {
            session.calls.push({
              tool: name,
              ms: session.now() - start,
              isError: settled.isError === true,
            });
            return settled;
          });
        session.memo.set(name, result);
        session.used.push(name);
      }
      return reply(id, textResult(await result));
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } };
  }
}
