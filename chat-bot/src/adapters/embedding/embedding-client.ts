import type { Embedder } from '../../app/ports';

/**
 * The local embedding service (chat-bot/embedding/serve.py) on 127.0.0.1:`port`. Each call fails
 * when the service isn't running or answers something else, for the caller to fall back.
 */
export function embeddingClient({
  port,
  fetch = globalThis.fetch,
  timeoutMs = 10_000,
}: {
  port: number;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): Embedder {
  const url = `http://127.0.0.1:${port}`;
  const call = async (path: string, body?: object): Promise<Record<string, unknown>> => {
    const response = await fetch(`${url}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`embedding service answered ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
  return {
    async info() {
      const { model, cutoff } = await call('/info');
      if (typeof model !== 'string') throw new Error('embedding service named no model');
      return { model, cutoff: typeof cutoff === 'number' ? cutoff : null };
    },
    async embed(texts, kind) {
      if (!texts.length) return [];
      const { vectors } = await call('/embed', { texts, kind });
      if (
        !Array.isArray(vectors) ||
        vectors.length !== texts.length ||
        !vectors.every((v) => Array.isArray(v) && v.every((x) => typeof x === 'number'))
      ) {
        throw new Error('embedding service gave no vector for each text');
      }
      return vectors;
    },
  };
}
