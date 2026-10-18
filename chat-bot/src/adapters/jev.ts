import type { Judge } from '../app/ports';

export interface JevOptions {
  /** A TypeSafe API key (console.typesafe.ai). */
  apiKey: string;
  model?: string;
  /** Give up on a call after this long. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * TypeSafe's Jev (`POST /v1/systemone`): a classifier that answers yes/no questions about a text
 * with a probability each, in a fraction of a second, for about $0.04 per million input tokens.
 */
export function jev({
  apiKey,
  model = 'jev-preview',
  timeoutMs = 10_000,
  fetch: fetchFn = fetch,
}: JevOptions): Judge {
  return async (state, questions) => {
    const response = await fetchFn('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        state,
        questions: Object.fromEntries(
          Object.entries(questions).map(([key, instructions]) => [
            key,
            { type: 'noul', instructions },
          ]),
        ),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`jev answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const { answers } = (await response.json()) as { answers: Record<string, { noul: number }> };
    return Object.fromEntries(Object.keys(questions).map((key) => [key, answers[key]?.noul ?? 0]));
  };
}
