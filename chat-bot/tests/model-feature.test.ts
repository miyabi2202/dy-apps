import { ModelFeature } from '../src/app/model-feature';
import { silentLog } from './fakes';

/** Builds `<subject>?`, asks `ask`, and delivers what comes back. */
class Echo extends ModelFeature<string, string> {
  readonly steps: string[] = [];

  constructor(private readonly model: (prompt: string) => Promise<string | undefined>) {
    super(silentLog);
  }

  say(subject: string): Promise<void> {
    return this.run(subject);
  }

  protected buildPrompt(subject: string): string {
    if (subject === 'no prompt') throw new Error('no prompt');
    return `${subject}?`;
  }

  protected ask(_subject: string, prompt: string): Promise<string | undefined> {
    return this.model(prompt);
  }

  protected deliver(subject: string, answer: string): void {
    if (answer === 'no delivery') throw new Error('no delivery');
    this.steps.push(`${subject} -> ${answer}`);
  }

  protected failed(subject: string, err: unknown): void {
    this.steps.push(`${subject} failed: ${(err as Error).message}`);
  }
}

test('builds the prompt, asks, and delivers the answer; nothing is delivered for undefined', async () => {
  const echo = new Echo((prompt) => Promise.resolve(prompt === '甲?' ? `答 ${prompt}` : undefined));
  await echo.say('甲');
  await echo.say('乙');

  expect(echo.steps).toEqual(['甲 -> 答 甲?']);
});

test('logs a failure of any step as the feature does, and never rejects', async () => {
  const echo = new Echo((prompt) =>
    prompt === '丙?' ? Promise.reject(new Error('model down')) : Promise.resolve('no delivery'),
  );
  await echo.say('no prompt');
  await echo.say('丙');
  await echo.say('丁');

  expect(echo.steps).toEqual([
    'no prompt failed: no prompt',
    '丙 failed: model down',
    '丁 failed: no delivery',
  ]);
});
