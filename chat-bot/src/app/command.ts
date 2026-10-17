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
 * offers its own (`Talker.commands()`, `Billing.commands()`, …) and main.ts hands them all to
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
  | {
      /** The prompt template (see buildPrompt), read each time so edits apply at once. */
      prompt: () => string;
      run?: never;
    }
);

/** A command that worked, saying `reply` back. */
export const done = (reply: string): CommandResult => ({ ok: true, reply });

/** A command that didn't, saying `reply` back (how to use it, say); it's refunded. */
export const failed = (reply: string): CommandResult => ({ ok: false, reply });
