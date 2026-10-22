import type { Command } from './command';
import type { AskModel } from '../ports';

export interface SolveCommandOptions {
  /** `解题`, or `拼命解题` for the one that thinks harder. */
  name: string;
  /** The prompt (solve.md, see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Codex's gpt-6-astra, at the effort and with the time the command gets. */
  ask: AskModel;
}

/**
 * `/解题 [题目或提示]` (or `/拼命解题`, thinking harder): works out the math, logic or figure
 * puzzle on the screen (or in the args), with a screenshot even while /截图 has them off. For
 * admins only; answered like a mention, from its own prompt, in JSON so only the answer is sent.
 */
export function solveCommand({ name, prompt, ask }: SolveCommandOptions): Command {
  return { name, adminOnly: true, prompt, ask, alwaysScreenshot: true, jsonMessage: true };
}
