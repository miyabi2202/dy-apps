import { errorMessage } from '../core/errors';
import type { AskClaude, Judge, Log } from './ports';

/** Which model a call goes to, and what it's for (`reply-pick`, `song-id`, `mention`…). */
export interface ModelTask {
  model: 'claude' | 'codex' | 'jev';
  task: string;
}

/**
 * Logs a call to a model as it starts (`<model> asking`) and as it ends (`<model> answered`, or
 * `<model> failed` with the error), with how long it took in `ms`, so the log shows when each
 * call ran and what it cost in time. Jev, asked every few seconds, logs at debug.
 */
function timed<T>(
  { model, task }: ModelTask,
  log: Log,
  now: () => number,
  call: () => Promise<T>,
): Promise<T> {
  const level = model === 'jev' ? 'debug' : 'info';
  const started = now();
  log[level](`${model} asking`, { task });
  return call().then(
    (answer) => {
      log[level](`${model} answered`, { task, ms: now() - started });
      return answer;
    },
    (err: unknown) => {
      log.warn(`${model} failed`, { task, ms: now() - started, error: errorMessage(err) });
      throw err;
    },
  );
}

/** `ask`, logged as `what` (see timed). */
export function timedAsk(what: ModelTask, ask: AskClaude, log: Log, now = Date.now): AskClaude {
  return (question) => timed(what, log, now, () => ask(question));
}

/** `judge`, logged as `what` (see timed). */
export function timedJudge(what: ModelTask, judge: Judge, log: Log, now = Date.now): Judge {
  return (state, questions) => timed(what, log, now, () => judge(state, questions));
}
