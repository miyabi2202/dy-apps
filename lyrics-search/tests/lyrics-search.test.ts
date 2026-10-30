import { CircuitBreaker } from '../src/limits';
import { LyricsSearch } from '../src/lyrics-search';
import PURE_MUSIC from './fixtures/lyric-pure-music.json';
import 画廊游记 from './fixtures/lyric-画廊游记.json';
import 遇萤 from './fixtures/lyric-遇萤.json';
import { recorded, recordedFetch } from './recorded';

const noLimit = async () => {};

describe('LyricsSearch.identify', () => {
  it('names 晴天 from its lines, without a singer: every hit is a cover', async () => {
    const song = recorded('晴天');
    const search = new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });
    const guess = await search.identify(song.lines);
    expect(guess).toMatchObject({ title: '晴天', sure: true });
    expect(guess.artist).toBeUndefined();
    expect(guess.artistShare).toBeLessThan(0.4);
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

  it("names the original from NetEase's marks when the hits don't name one, and marks the candidates", async () => {
    const song = recorded('遇萤');
    const search = new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });
    const guess = await search.identify(song.lines);
    // Covers outnumber it: by share alone no one is named, and Codex named 只有影子, a cover.
    expect(guess).toMatchObject({ title: '遇萤', sure: true, artist: 'CRITTY', artistBy: 'marks' });
    expect(guess.candidates[0]!.originals[0]).toBe('CRITTY');
    expect(guess.candidates[0]!.covers).toContain('只有影子');
    // The version whose lyrics matched first, for its lyrics.
    expect(guess.id).toBe(37782740);
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
      fetch: recordedFetch({ lines: [a!, b!], responses, titles: {} }),
      limit: noLimit,
      minRatio: 5,
    });
    const guess = await search.identify([a!, b!]);
    expect(guess.sure).toBe(false);
    expect(guess.candidates.length).toBeGreaterThan(1);
    expect(guess.why).toMatch(/^score /);
    expect(guess.artist).toBeUndefined();
  });

  it('counts the title search for the singer, and only the lyric hits when it fails', async () => {
    const song = recorded('FIRESTARTER');
    const withTitles = new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });
    expect((await withTitles.identify(song.lines)).artist).not.toBe('Oh_MacyLin');
    const without = new LyricsSearch({
      fetch: recordedFetch({ ...song, titles: {} }),
      limit: noLimit,
    });
    expect(await without.identify(song.lines)).toMatchObject({ sure: true, artist: 'Oh_MacyLin' });
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
      fetch: recordedFetch({ lines: song.lines, responses: {}, titles: {} }, (q) => calls.push(q)),
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
    expect((await search.identify(song.lines)).ms).toBe(300);
  });
});

describe('LyricsSearch.lookup', () => {
  const song = recorded('遇萤');
  const search = () => new LyricsSearch({ fetch: recordedFetch(song), limit: noLimit });

  it("puts the singer's versions of the title first, and leaves other titles out", async () => {
    const ids = await search().lookup('遇萤', '李蚊香');
    expect(ids.slice(0, 3)).toEqual([1906968692, 37782740, 423849091]);
    // 遇萤（剧情版） is the same title; a song with another title isn't.
    expect(ids).toContain(35848447);
    expect(ids).not.toContain(undefined);
  });

  it("keeps NetEase's order when the singer has none, or none was given", async () => {
    expect((await search().lookup('遇萤', '周杰伦'))[0]).toBe(37782740);
    expect((await search().lookup('遇萤'))[0]).toBe(37782740);
  });

  it("takes the singer's version whose title goes on past the one asked for", async () => {
    // NetEase's title search for 野火: HOYO-MiX's is 「野火 Wildfire」, the others' other songs.
    const song = (id: number, name: string, ...artists: string[]) => ({
      id,
      name,
      ar: artists.map((name) => ({ name })),
    });
    const titles = {
      野火: {
        code: 200,
        result: {
          songs: [
            song(1981028372, '野火', '戾格'),
            song(2045806409, '野火 Wildfire', 'HOYO-MiX', 'Jonathan Steingard'),
            song(2005441063, 'Wildfire (Piano and Violin Version)', 'SYML'),
            song(3447641779, '野火 Wildfire', '苏昭影'),
          ],
        },
      },
    };
    const search = new LyricsSearch({
      fetch: recordedFetch({ lines: [], responses: {}, titles }),
      limit: noLimit,
    });
    expect(await search.lookup('野火', 'HOYO-MiX')).toEqual([2045806409, 1981028372]);
    expect(await search.lookup('野火')).toEqual([1981028372]);
  });

  it('is empty when the title search fails', async () => {
    const failing = new LyricsSearch({
      fetch: recordedFetch({ lines: [], responses: {}, titles: {} }),
      limit: noLimit,
    });
    expect(await failing.lookup('遇萤', 'CRITTY')).toEqual([]);
  });
});

describe('LyricsSearch.lyrics', () => {
  it('is empty when NetEase fails, and counts the failure on the breaker', async () => {
    const breaker = new CircuitBreaker({ failures: 1, offMs: 600_000 });
    const failing = (() =>
      Promise.resolve(new Response('', { status: 500 }))) as unknown as typeof fetch;
    const search = new LyricsSearch({ fetch: failing, limit: noLimit, breaker });
    expect(await search.lyrics(1)).toEqual([]);
    expect(breaker.open()).toBe(true);
  });
});

describe('LyricsSearch.songLyrics', () => {
  /** 遇萤's title search, and each version's lyrics by its number: one an instrumental. */
  const fetchFn = (lyricsById: Record<string, unknown>, asked: string[] = []) =>
    ((url: string) => {
      const { pathname, searchParams } = new URL(url);
      if (pathname.endsWith('/lyric')) {
        const id = searchParams.get('id') ?? '';
        asked.push(id);
        const body = lyricsById[id];
        return Promise.resolve(
          body ? new Response(JSON.stringify(body)) : new Response('', { status: 500 }),
        );
      }
      return recordedFetch(recorded('遇萤'))(url);
    }) as unknown as typeof fetch;

  it('runs the lyrics of the first versions with lyrics together, past an instrumental', async () => {
    const asked: string[] = [];
    const search = new LyricsSearch({
      fetch: fetchFn({ 37782740: 遇萤, 1906968692: PURE_MUSIC, 423849091: 画廊游记 }, asked),
      limit: noLimit,
    });
    const lines = await search.songLyrics('遇萤', '', { versions: 2 });
    expect(asked).toEqual(['37782740', '1906968692', '423849091']);
    expect(lines).toContain('若千年的光阴');
    expect(lines).toContain('在一切开始的时分');
  });

  it('is empty when no version tried has lyrics', async () => {
    const search = new LyricsSearch({ fetch: fetchFn({}), limit: noLimit });
    expect(await search.songLyrics('遇萤', 'CRITTY', { tries: 2 })).toEqual([]);
  });
});
