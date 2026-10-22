import { CircuitBreaker } from '../src/limits';
import { LyricsSearch } from '../src/lyrics-search';
import { recorded, recordedFetch } from './recorded';

const noLimit = async () => {};

describe('LyricsSearch.identify', () => {
  it('names 晴天 from its lines, without a singer: every hit is a cover', async () => {
    const song = recorded('晴天');
    const search = new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });
    const guess = await search.identify(song.lines);
    expect(guess).toMatchObject({ title: '晴天', sure: true });
    expect(guess.artist).toBeUndefined();
    expect(guess.artistShare).toBeLessThan(0.5);
    expect(guess.queries).toHaveLength(5);
    expect(guess.candidates[0]).toMatchObject({ title: '晴天' });
  });

  it('names the singer when one owns the title', async () => {
    const song = recorded('雨爱');
    const search = new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });
    expect(await search.identify(song.lines)).toMatchObject({
      title: '雨爱',
      artist: '杨丞琳',
      sure: true,
    });
  });

  it('is unsure, with candidates, when the lines do not agree', async () => {
    const song = recorded('晴天');
    // Only the first two lines are searched, and the answers of two different songs.
    const [a, b] = song.lines;
    const other = recorded('雨爱');
    const responses = {
      [a!]: song.responses[a!],
      [b!]: Object.values(other.responses)[0],
    };
    const search = new LyricsSearch({
      fetch: recordedFetch({ lines: [a!, b!], responses }),
      limit: noLimit,
      minRatio: 5,
    });
    const guess = await search.identify([a!, b!]);
    expect(guess.sure).toBe(false);
    expect(guess.candidates.length).toBeGreaterThan(1);
    expect(guess.why).toMatch(/^score /);
    expect(guess.artist).toBeUndefined();
  });

  it('does not search with fewer than two usable lines', async () => {
    const calls: string[] = [];
    const search = new LyricsSearch({
      fetch: recordedFetch(recorded('晴天'), (q) => calls.push(q)),
      limit: noLimit,
    });
    expect(await search.identify(['你好', '故事的小黄花从出生那年就飘着'])).toMatchObject({
      sure: false,
      why: 'too few lines',
    });
    expect(calls).toEqual([]);
  });

  it('still votes when one query fails', async () => {
    const song = recorded('晴天');
    const [, ...rest] = Object.keys(song.responses);
    const search = new LyricsSearch({
      fetch: recordedFetch({
        ...song,
        responses: Object.fromEntries(rest.map((q) => [q, song.responses[q]])),
      }),
      limit: noLimit,
    });
    expect(await search.identify(song.lines)).toMatchObject({ title: '晴天', sure: true });
  });

  it('opens the breaker after three rounds where every query failed, and then makes no request', async () => {
    const song = recorded('晴天');
    const calls: string[] = [];
    let clock = 0;
    const now = () => clock;
    const search = new LyricsSearch({
      fetch: recordedFetch({ lines: song.lines, responses: {} }, (q) => calls.push(q)),
      limit: noLimit,
      now,
      breaker: new CircuitBreaker({ failures: 3, offMs: 600_000, now }),
    });
    for (let i = 0; i < 3; i++) {
      expect(await search.identify(song.lines)).toMatchObject({
        sure: false,
        why: 'netease failed',
      });
    }
    expect(calls).toHaveLength(15);
    expect(await search.identify(song.lines)).toMatchObject({ sure: false, why: 'netease down' });
    expect(calls).toHaveLength(15);
    clock = 600_000;
    await search.identify(song.lines);
    expect(calls).toHaveLength(20);
  });

  it('measures ms with the injected clock', async () => {
    const song = recorded('晴天');
    let clock = 1000;
    const search = new LyricsSearch({
      fetch: recordedFetch(song, () => void (clock += 50)),
      limit: noLimit,
      now: () => clock,
    });
    expect((await search.identify(song.lines)).ms).toBe(250);
  });
});
