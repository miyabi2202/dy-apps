import type { Judge } from '../../app/ports';
import { OutOfCreditError } from '../../core/errors';

export interface JevOptions {
  /** A TypeSafe API key (console.typesafe.ai). */
  apiKey: string;
  model?: string;
  /** Give up on a call after this long. */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/**
 * How TypeSafe turns a call down for want of money: undocumented, so a 402, or a 403 or 429 that
 * says so (a plain 429 is a rate limit, which passes).
 */
function outOfCredit(status: number, body: string): boolean {
  return (
    status === 402 ||
    ([403, 429].includes(status) && /credit|balance|billing|quota|payment|fund/i.test(body))
  );
}

/**
 * TypeSafe's Jev (`POST /v1/systemone`): a classifier that answers yes/no questions about a text
 * with a probability each, in a fraction of a second, for about $0.04 per million input tokens.
 * Throws OutOfCreditError when the account has run out of money.
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
      const body = (await response.text()).slice(0, 300);
      const message = `jev answered ${response.status}: ${body}`;
      throw outOfCredit(response.status, body) ? new OutOfCreditError(message) : new Error(message);
    }
    const { answers } = (await response.json()) as { answers: Record<string, { noul: number }> };
    return Object.fromEntries(Object.keys(questions).map((key) => [key, answers[key]?.noul ?? 0]));
  };
}
