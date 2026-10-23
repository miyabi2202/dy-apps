import { markedSingers, pickArtist, pickOriginal } from '../src/artist';
import { parseLyricsResponse } from '../src/netease';
import { normaliseTitle } from '../src/normalise';
import { vote } from '../src/vote';
import { recorded } from './recorded';

/** The hits under the winning title of a recorded song: from its lyric searches and its title search. */
function winnerHits(name: string) {
  const { responses, titles } = recorded(name);
  const { ranked, hitsBy } = vote(Object.values(responses).map(parseLyricsResponse));
  const title = ranked[0]?.[0] ?? '';
  const titleHits = Object.values(titles)
    .flatMap(parseLyricsResponse)
    .filter((hit) => normaliseTitle(hit.title) === title);
  return { title, lyricHits: hitsBy.get(title) ?? [], titleHits };
}

describe('pickArtist on recorded NetEase responses', () => {
  it('names 杨丞琳 for 雨爱: she leads the lyric and title hits', () => {
    const { title, lyricHits, titleHits } = winnerHits('雨爱');
    expect(title).toBe(normaliseTitle('雨爱'));
    const { artist, share } = pickArtist({ lyricHits, titleHits });
    expect(artist).toBe('杨丞琳');
    expect(share).toBeGreaterThanOrEqual(0.4);
  });

  it('names nobody for 晴天: every hit is one of many covers', () => {
    const { title, lyricHits, titleHits } = winnerHits('晴天');
    expect(title).toBe(normaliseTitle('晴天'));
    expect(pickArtist({ lyricHits, titleHits }).artist).toBeUndefined();
    expect(pickArtist({ lyricHits, titleHits }).share).toBeLessThan(0.4);
  });

  it('names nobody for 南屏晚钟: 蔡琴 and the original 崔萍 are close', () => {
    const { title, lyricHits, titleHits } = winnerHits('南屏晚钟');
    expect(title).toBe(normaliseTitle('南屏晚钟'));
    expect(pickArtist({ lyricHits, titleHits }).artist).toBeUndefined();
  });

  it('names nobody for 云裳羽衣曲: two covers at 17% each', () => {
    const { title, lyricHits, titleHits } = winnerHits('云裳羽衣曲');
    expect(title).toBe(normaliseTitle('云裳羽衣曲'));
    expect(pickArtist({ lyricHits, titleHits }).artist).toBeUndefined();
  });

  it('never names a cover for FIRESTARTER: the lyrics search finds only covers, the title search the group', () => {
    const { title, lyricHits, titleHits } = winnerHits('FIRESTARTER');
    expect(title).toBe(normaliseTitle('FIRESTARTER'));
    expect(lyricHits.map((hit) => hit.artists.join('、'))).toEqual(
      expect.arrayContaining(['Oh_MacyLin']),
    );
    expect(pickArtist({ lyricHits }).artist).toBe('Oh_MacyLin');
    expect(pickArtist({ lyricHits, titleHits }).artist).not.toBe('Oh_MacyLin');
    // K/DA's credit is split across its recordings, so most likely nobody leads; if one does, it is the group's.
    expect(pickArtist({ lyricHits, titleHits }).artist ?? 'K/DA').toMatch(/K\/DA/);
  });
});

describe('pickArtist', () => {
  it('counts spellings of one singer as one, and weighs hits by popularity', () => {
    const hit = (artist: string, pop: number) => ({ title: '歌', artists: [artist], pop });
    const hits = [hit('中島美嘉', 50), hit('中岛美嘉', 50), hit('别人', 0), hit('另一个', 0)];
    expect(pickArtist({ lyricHits: hits })).toEqual({ artist: '中島美嘉', share: 3 / 5 });
  });

  it('names nobody when there are no hits', () => {
    expect(pickArtist({ lyricHits: [] })).toEqual({ share: 0 });
  });
});

describe("NetEase's original and cover marks", () => {
  const hit = (artists: string[], cover?: boolean, id?: number) => ({
    title: '遇萤',
    artists,
    pop: 0,
    ...(cover !== undefined && { cover }),
    ...(id !== undefined && { id }),
  });

  it('names the singer most versions marked original credit, once a version counts once', () => {
    const hits = [
      hit(['CRITTY'], false, 1),
      hit(['CRITTY'], false, 1),
      hit(['CRITTY', '橙光音乐'], false, 2),
      hit(['CRITTY'], false, 3),
      hit(['执素兮'], false, 4),
      hit(['只有影子'], true, 5),
    ];
    expect(pickOriginal('遇萤', hits)).toEqual({ artist: 'CRITTY', share: 0.75, versions: 3 });
  });

  it("counts a cover's link to its original, and names no one from a lone or contested mark", () => {
    const linked = {
      ...hit(['一夜冷月'], true),
      coverOf: { title: '遇萤（剧情版）', artists: ['CRITTY'] },
    };
    expect(pickOriginal('遇萤', [hit(['CRITTY'], false, 1), linked]).artist).toBe('CRITTY');
    expect(pickOriginal('遇萤', [hit(['CRITTY'], false, 1)]).artist).toBeUndefined();
    expect(
      pickOriginal('遇萤', [hit(['A'], false, 1), hit(['A'], false, 2), hit(['B'], false, 3)])
        .artist,
    ).toBeUndefined();
    expect(pickOriginal('遇萤', [hit(['只有影子'], true, 1), hit(['只有影子'], true, 2)])).toEqual({
      share: 0,
      versions: 0,
    });
  });

  it('lists the originals, with the ones covers link to, and the covers', () => {
    const linked = { ...hit(['一夜冷月'], true), coverOf: { title: '遇萤', artists: ['CRITTY'] } };
    expect(
      markedSingers([hit(['CRITTY'], false), hit(['只有影子'], true), hit(['某人']), linked]),
    ).toEqual({
      originals: ['CRITTY'],
      covers: ['只有影子', '一夜冷月'],
    });
  });
});
