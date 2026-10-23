import { timedAsk, timedJudge } from '../app/models/timed-models';
import type { SolveEffort } from '../core/commands/settings';
import type { Container } from './container';
import { zoomServer } from './adapters';
import {
  ASK_CLAUDE,
  ASK_CODEX,
  ASK_SOLVE,
  CLAUDE_CLI,
  CODEX_CLI,
  ENV,
  JEV_CLIENT,
  JUDGE,
  LOG,
  OPTIONS,
  PACKAGE_DIR,
} from './tokens';

/**
 * The models, each use of which logs as it starts and ends, with its task and time (`claude
 * asking`, `claude answered`).
 */
export function registerModels(container: Container): void {
  container
    .register(ASK_CLAUDE, (c) => {
      const [claude, log] = [c.resolve(CLAUDE_CLI), c.resolve(LOG)];
      return (task) => timedAsk({ model: 'claude', task }, claude, log);
    })
    .register(ASK_CODEX, (c) => {
      const [codex, log] = [c.resolve(CODEX_CLI), c.resolve(LOG)];
      return (task, over) => timedAsk({ model: 'codex', task }, codex(over), log);
    })
    // ask_about_puzzle: Codex's gpt-6-astra, which on figure puzzles was faster and more often
    // right than Claude Opus or Fable, even with their zoom tool. Both efforts are made up front;
    // `high` (the room's solveEffort) thinks harder and gets 10 minutes instead of 6.
    .register(ASK_SOLVE, (c) => {
      const codex = c.resolve(ASK_CODEX);
      const zoom = zoomServer(c.resolve(PACKAGE_DIR));
      const asking = (effort: SolveEffort, timeoutMs: number) =>
        codex('puzzle', { model: 'gpt-6-astra', effort, webSearch: false, timeoutMs, zoom });
      const models = { medium: asking('medium', 360_000), high: asking('high', 600_000) };
      return (effort) => models[effort];
    })
    // Jev, logged per use like the models above. Auto-reply and malice watch need Jev (with
    // JEV_API_KEY from chat-bot/.env) and Codex both; without either, the bot only talks when @ed.
    .register(JUDGE, (c) => {
      const [options, log] = [c.resolve(OPTIONS), c.resolve(LOG)];
      const jevKey = c.resolve(ENV).JEV_API_KEY;
      if (!jevKey)
        log.warn('no JEV_API_KEY in chat-bot/.env: auto-reply is off, the bot only talks when @ed');
      if (!options.codex)
        log.warn('--codex is empty: auto-reply is off, the bot only talks when @ed');
      const judge = jevKey && options.codex ? c.resolve(JEV_CLIENT)(jevKey) : undefined;
      return (task) => judge && timedJudge({ model: 'jev', task }, judge, log);
    });
}
