import type { TranscriptLine } from '../core/transcript';
import type { AskClaude } from './ports';

/**
 * What a command came to: `reply` is what the bot says back, nothing when empty (the command
 * spoke for itself). A failed one is refunded.
 */
export interface CommandResult {
  ok: boolean;
  reply: string;
}

/**
 * Something viewers can tell the bot to do, as `@机器人/<name> <args>`: either `run` it, or ask
 * Claude with its own `prompt` (the args as the question), answered like a mention. Each feature
 * offers its own (`AutoReply.commands()`, `Billing.commands()`, …) and main.ts hands them all to
 * the ChatBot.
 */
export type Command = {
  name: string;
  /** Only admins can run it; anyone else's call is ignored. */
  adminOnly: boolean;
  /** Diamonds it costs a viewer, taken before it runs; a mention's price when not set. Admins
   * never pay. */
  price?: number;
} & (
  | { run(args: string): CommandResult | Promise<CommandResult>; prompt?: never }
  | ({
      /** The prompt template (see buildPrompt), read each time so edits apply at once. */
      prompt: () => string;
      run?: never;
    } & PromptOptions)
);

/** How a command with its own prompt is answered, besides the prompt. */
export interface PromptOptions {
  /** The tools Claude may use, when not all of the usual ones. */
  tools?: readonly string[];
  /** Give up after this many of Claude's turns, to cap the cost (and refund). */
  maxTurns?: number;
  /** Who answers it, when not the usual Claude. */
  ask?: AskClaude;
  /** The part of what the streamer said lately that the prompt gets, when not all of it. */
  pickTranscript?: (lines: readonly TranscriptLine[]) => TranscriptLine[];
}

/** A command that worked, saying `reply` back. */
export const done = (reply: string): CommandResult => ({ ok: true, reply });

/** A command that didn't, saying `reply` back (how to use it, say); it's refunded. */
export const failed = (reply: string): CommandResult => ({ ok: false, reply });
