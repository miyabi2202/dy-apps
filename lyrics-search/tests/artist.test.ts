import { pickArtist } from '../src/artist';
import { parseLyricsResponse } from '../src/netease';
import { normaliseTitle } from '../src/normalise';
import { vote } from '../src/vote';
import { recorded } from './recorded';

/** The lyric hits under the winning title of a recorded song. */
function winnerHits(name: string) {
  const { responses } = recorded(name);
  const { ranked, hitsBy } = vote(Object.values(responses).map(parseLyricsResponse));
  const [winner] = ranked;
  return { title: winner?.[0], hits: hitsBy.get(winner?.[0] ?? '') ?? [] };
}

describe('pickArtist on recorded NetEase responses', () => {
  it('names 杨丞琳 for 雨爱: 17 of 30 hits are hers', () => {
    const { title, hits } = winnerHits('雨爱');
    expect(title).toBe(normaliseTitle('雨爱'));
    const { artist, share } = pickArtist(hits);
    expect(artist).toBe('杨丞琳');
    expect(share).toBeGreaterThanOrEqual(0.5);
  });

  it('names nobody for 晴天: every hit is one of many covers', () => {
    const { title, hits } = winnerHits('晴天');
    expect(title).toBe(normaliseTitle('晴天'));
    expect(pickArtist(hits).artist).toBeUndefined();
    expect(pickArtist(hits).share).toBeLessThan(0.5);
  });

  it('names nobody for 南屏晚钟: 蔡琴 and the original 崔萍 are close', () => {
    const { title, hits } = winnerHits('南屏晚钟');
    expect(title).toBe(normaliseTitle('南屏晚钟'));
    expect(pickArtist(hits).artist).toBeUndefined();
  });

  it('names nobody for 云裳羽衣曲: two covers at 17% each', () => {
    const { title, hits } = winnerHits('云裳羽衣曲');
    expect(title).toBe(normaliseTitle('云裳羽衣曲'));
    expect(pickArtist(hits).artist).toBeUndefined();
  });
});

describe('pickArtist', () => {
  it('counts spellings of one singer as one, and weighs hits by popularity', () => {
    const hit = (artist: string, pop: number) => ({ title: '歌', artists: [artist], pop });
    const hits = [hit('中島美嘉', 50), hit('中岛美嘉', 50), hit('别人', 0), hit('另一个', 0)];
    expect(pickArtist(hits)).toEqual({ artist: '中島美嘉', share: 3 / 5 });
  });

  it('names nobody when there are no hits', () => {
    expect(pickArtist([])).toEqual({ share: 0 });
  });
});
