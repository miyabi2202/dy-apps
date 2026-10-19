import type { Command } from './command';
import type { AskClaude } from './ports';

export interface SolveCommandOptions {
  /** The prompt (solve.md, see buildPrompt), read each time so edits apply at once. */
  prompt: () => string;
  /** Claude set up for puzzles: more effort, the zoom tool, a longer timeout. */
  ask: AskClaude;
}

/**
 * `/解题 [题目或提示]`: works out the math, logic or figure puzzle on the screen (or in the
 * args), with a screenshot even while /截图 has them off, which Claude can zoom into. Anyone may
 * use it, at a mention's price; it's answered like a mention, from its own prompt.
 */
export function solveCommand({ prompt, ask }: SolveCommandOptions): Command {
  return { name: '解题', adminOnly: false, prompt, ask, alwaysScreenshot: true };
}
