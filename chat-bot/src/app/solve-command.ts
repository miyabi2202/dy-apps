import type { Command } from './command';
import type { AskClaude } from './ports';

export interface SolveCommandOptions {
  /** `解题`, or `拼命解题` for the one that thinks harder. */
  name: string;
  /** The prompt (solve.md, see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Claude set up for puzzles: the model, more effort, the zoom tool, a longer timeout. */
  ask: AskClaude;
}

/**
 * `/解题 [题目或提示]` (or `/拼命解题`, with a stronger, slower model): works out the math, logic
 * or figure puzzle on the screen (or in the args), with a screenshot even while /截图 has them
 * off, which Claude can zoom into. For admins only, since it's slow and costly; answered like a
 * mention, from its own prompt, in JSON so only the answer is sent.
 */
export function solveCommand({ name, prompt, ask }: SolveCommandOptions): Command {
  return { name, adminOnly: true, prompt, ask, alwaysScreenshot: true, jsonMessage: true };
}
