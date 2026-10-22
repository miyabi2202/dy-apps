import type { Log } from '../../../src/app/ports';
import { timedAsk, timedJudge } from '../../../src/app/models/timed-models';

function recordingLog() {
  const lines: [string, string, object | undefined][] = [];
  const at =
    (level: string) =>
    (message: string, meta?: object): void => {
      lines.push([level, message, meta]);
    };
  const log: Log = { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
  return { log, lines };
}

test('logs a call as it starts and ends, with how long it took, and a failure as one', async () => {
  const { log, lines } = recordingLog();
  let clock = 1000;
  const now = () => clock;
  const ask = timedAsk(
    { model: 'codex', task: 'reply-pick' },
    ({ prompt }) => {
      clock += 4200;
      return prompt === 'fail' ? Promise.reject(new Error('quota')) : Promise.resolve('ok');
    },
    log,
    now,
  );
  await expect(ask({ prompt: 'hi' })).resolves.toBe('ok');
  await expect(ask({ prompt: 'fail' })).rejects.toThrow('quota');
  expect(lines).toEqual([
    ['info', 'codex asking', { task: 'reply-pick' }],
    ['info', 'codex answered', { task: 'reply-pick', ms: 4200 }],
    ['info', 'codex asking', { task: 'reply-pick' }],
    ['warn', 'codex failed', { task: 'reply-pick', ms: 4200, error: 'quota' }],
  ]);
});

test('Jev, asked every few seconds, answers at debug', async () => {
  const { log, lines } = recordingLog();
  const judge = timedJudge(
    { model: 'jev', task: 'about-the-bot' },
    () => Promise.resolve({ about: 0.7 }),
    log,
    () => 0,
  );
  await expect(judge('state', { about: '?' })).resolves.toEqual({ about: 0.7 });
  expect(lines[1]).toEqual(['debug', 'jev answered', { task: 'about-the-bot', ms: 0 }]);
});
