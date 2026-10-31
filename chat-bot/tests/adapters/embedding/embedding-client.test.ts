import { embeddingClient } from '../../../src/adapters/embedding/embedding-client';

/** A fetch that answers `body` (or `status`), and records what it was asked. */
function fakeFetch(answer: { status?: number; body?: unknown }) {
  const asked: { url: string; init?: RequestInit }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 }),
    );
  };
  return { fetch: fetch as typeof globalThis.fetch, asked };
}

test('asks the local service what model it is, and for vectors', async () => {
  const info = fakeFetch({ body: { model: 'Qwen/Qwen3-Embedding-0.6B', dims: 2, cutoff: 0.47 } });
  expect(await embeddingClient({ port: 8759, fetch: info.fetch }).info()).toEqual({
    model: 'Qwen/Qwen3-Embedding-0.6B',
    cutoff: 0.47,
  });
  expect(info.asked[0]!.url).toBe('http://127.0.0.1:8759/info');

  const embed = fakeFetch({ body: { model: 'm', vectors: [[0.6, 0.8]] } });
  const client = embeddingClient({ port: 8759, fetch: embed.fetch });
  expect(await client.embed(['稻香'], 'query')).toEqual([[0.6, 0.8]]);
  expect(embed.asked[0]!.url).toBe('http://127.0.0.1:8759/embed');
  expect(JSON.parse(embed.asked[0]!.init!.body as string)).toEqual({
    texts: ['稻香'],
    kind: 'query',
  });
  // Nothing to embed asks nothing.
  expect(await client.embed([], 'document')).toEqual([]);
  expect(embed.asked).toHaveLength(1);
});

test('a cutoff not measured is null; an answer it cannot use fails', async () => {
  const noCutoff = fakeFetch({ body: { model: 'm', cutoff: null } });
  expect((await embeddingClient({ port: 1, fetch: noCutoff.fetch }).info()).cutoff).toBeNull();

  const short = fakeFetch({ body: { vectors: [] } });
  await expect(
    embeddingClient({ port: 1, fetch: short.fetch }).embed(['a'], 'query'),
  ).rejects.toThrow('no vector for each text');
  const down = fakeFetch({ status: 500 });
  await expect(embeddingClient({ port: 1, fetch: down.fetch }).info()).rejects.toThrow('500');
});
