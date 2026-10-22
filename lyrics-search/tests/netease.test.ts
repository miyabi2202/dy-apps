import { neteaseClient } from '../src/netease';

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url: new URL(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

describe('neteaseClient.searchLyrics', () => {
  it('asks for lyrics matches with the headers NetEase wants', async () => {
    const { fetchFn, calls } = fakeFetch({ code: 200, result: { songs: [] } });
    await neteaseClient({ fetch: fetchFn }).searchLyrics('故事的小黄花');
    const call = calls[0]!;
    expect(call.url.origin + call.url.pathname).toBe('https://music.163.com/api/cloudsearch/pc');
    expect(Object.fromEntries(call.url.searchParams)).toEqual({
      s: '故事的小黄花',
      type: '1006',
      limit: '10',
    });
    expect(call.init.headers).toEqual({
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://music.163.com/',
    });
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('searches titles with type 1 and 20 results', async () => {
    const { fetchFn, calls } = fakeFetch({ code: 200, result: { songs: [] } });
    await neteaseClient({ fetch: fetchFn }).searchTitle('晴天');
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({
      s: '晴天',
      type: '1',
      limit: '20',
    });
  });

  it('parses the songs into hits', async () => {
    const { fetchFn } = fakeFetch({
      code: 200,
      result: {
        songs: [
          { name: '晴天', id: 186016, ar: [{ name: '周杰伦' }], pop: 100 },
          { name: '晴天', ar: [{ name: '某人' }, { name: '另一人' }] },
        ],
      },
    });
    expect(await neteaseClient({ fetch: fetchFn }).searchLyrics('x')).toEqual([
      { title: '晴天', artists: ['周杰伦'], pop: 100, id: 186016 },
      { title: '晴天', artists: ['某人', '另一人'], pop: 0 },
    ]);
  });

  it('answers no hits when the response has no songs', async () => {
    const { fetchFn } = fakeFetch({ code: 200, result: {} });
    expect(await neteaseClient({ fetch: fetchFn }).searchLyrics('x')).toEqual([]);
  });

  it('fails on a code other than 200, an HTTP error and bad JSON', async () => {
    await expect(
      neteaseClient({
        fetch: fakeFetch({ code: -460, message: '网络太拥挤' }).fetchFn,
      }).searchLyrics('x'),
    ).rejects.toThrow('-460');
    await expect(
      neteaseClient({ fetch: fakeFetch('oops', 500).fetchFn }).searchLyrics('x'),
    ).rejects.toThrow('500');
    await expect(
      neteaseClient({ fetch: fakeFetch('<html>').fetchFn }).searchLyrics('x'),
    ).rejects.toThrow();
  });

  it('waits for the rate limit before each request', async () => {
    const order: string[] = [];
    const fetchFn = (async () => {
      order.push('fetch');
      return new Response(JSON.stringify({ code: 200 }));
    }) as unknown as typeof fetch;
    await neteaseClient({
      fetch: fetchFn,
      limit: async () => void order.push('limit'),
    }).searchLyrics('x');
    expect(order).toEqual(['limit', 'fetch']);
  });
});
