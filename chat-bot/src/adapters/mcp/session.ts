import type { BotTool, ToolCall, ToolContext, ToolResult } from '../../core/tools/bot-tool';

/**
 * One question's tools: who it's for, the tools it may call (an admin-only one only for an admin,
 * one switched off by its setting for nobody), what each tool answered (a tool runs at most once
 * per question, so a repeated call returns the first result, which caps what a slow one such as
 * the song search can cost; a `repeatable` one runs each time), and the order they were called in. The SDK's server is made again for
 * each request (a stateless transport serves one), so this is where the question's state lives.
 */
export interface Session {
  context: ToolContext;
  tools: readonly BotTool[];
  memo: Map<string, Promise<ToolResult>>;
  /** What each call took, in order, for the log. */
  calls: ToolCall[];
}

export const newSession = (context: ToolContext, tools: readonly BotTool[]): Session => ({
  context,
  tools: tools.filter(
    (tool) => (!tool.adminOnly || context.admin === true) && (tool.offered?.() ?? true),
  ),
  memo: new Map(),
  calls: [],
});
