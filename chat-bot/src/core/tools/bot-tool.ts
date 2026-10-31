import type { ToolListen } from '../chat/relevance';
import type { Viewer } from './tool-definition';

/** Where Claude reaches the bot's tools for one question, and the tools it may call. */
export interface ToolAccess {
  url: string;
  /** Only for this question: it stops working when the answer is done. */
  token: string;
  /** The tool names. */
  tools: readonly string[];
}

/** Who asked and what, so a tool knows whom it works for. */
export interface ToolContext {
  /** The asker's nickname as given (`苦***` in a 私密 room). */
  asker: string;
  /** The asker's user id as the adapter gives it (`111111-苦***-31` in a 私密 room). */
  userId?: string;
  question: string;
  /** Whether the asker is an admin (or the streamer): only then are admin-only tools offered. */
  admin?: boolean;
  /** Typed as a `/` command, with no model: the tool may then speak for itself (the song intro follows /识歌). */
  direct?: boolean;
  /** Who the asker is (badges, fan club, wealth level), for a tool's `only` / `except`. */
  viewer?: Viewer;
}

/** What a tool answers: text for Claude to read. */
export interface ToolResult {
  text: string;
  isError?: boolean;
  /** The bot says nothing more to this question, whatever Claude answers (press_like's likes). */
  silent?: true;
  /**
   * With `silent`: what the bot says to the asker itself instead (「钻石不够送小心心」), even when
   * another tool was silent too.
   */
  say?: string;
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
  /** Whether it's offered now (a room setting that switches it on); always, without it. Asked as each question opens. */
  offered?: () => boolean;
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

/** One tool call Claude made while answering, for the log. */
export interface ToolCall {
  tool: string;
  ms: number;
  isError: boolean;
  /** Its result was silent: the answer isn't sent. */
  silent?: true;
  /** What its result had the bot say instead (see ToolResult.say). */
  say?: string;
}

/** One question's tools, open until `close()`. */
export interface ToolSession {
  access: ToolAccess;
  /** The tools Claude called so far, in order. */
  used(): string[];
  /** What each tool Claude called took, in order. */
  calls(): ToolCall[];
  close(): void;
}
