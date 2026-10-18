import { jev } from '../src/adapters/jev';

test('asks Jev one yes/no question per key and gives back each probability', async () => {
  const requests: { url: string; body: string }[] = [];
  const judge = jev({
    apiKey: 'key',
    fetch: (url, init) => {
      requests.push({ url: url as string, body: init!.body as string });
      return Promise.resolve(
        new Response(JSON.stringify({ answers: { q1: { type: 'noul', noul: 0.9 } } })),
      );
    },
  });

  expect(await judge('直播间…', { q1: '在说机器人吗？', q2: '也在说吗？' })).toEqual({
    q1: 0.9,
    q2: 0,
  });
  expect(requests[0]?.url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(JSON.parse(requests[0]!.body)).toEqual({
    model: 'jev-preview',
    state: '直播间…',
    questions: {
      q1: { type: 'noul', instructions: '在说机器人吗？' },
      q2: { type: 'noul', instructions: '也在说吗？' },
    },
  });

  const failing = jev({
    apiKey: 'key',
    fetch: () => Promise.resolve(new Response('bad key', { status: 401 })),
  });
  await expect(failing('', {})).rejects.toThrow('jev answered 401: bad key');
});
