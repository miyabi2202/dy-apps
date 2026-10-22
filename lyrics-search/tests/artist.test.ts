import { pickArtist } from '../src/artist';
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
