import { cleanLine, displayTitle, foldArtist, normaliseTitle } from '../src/normalise';

describe('normaliseTitle', () => {
  it('reduces versions of a title to the bare title', () => {
    const bare = normaliseTitle('ユキトキ');
    expect(normaliseTitle('ユキトキ (TV Size)')).toBe(bare);
    expect(normaliseTitle('知我（抒情版）')).toBe(normaliseTitle('知我'));
    expect(normaliseTitle('一番の宝物 ～Yui final ver.～')).toBe(normaliseTitle('一番の宝物'));
    expect(normaliseTitle('晴天 - DJ版')).toBe(normaliseTitle('晴天'));
    expect(normaliseTitle('晴天 (Live)')).toBe(normaliseTitle('晴天'));
    expect(normaliseTitle('晴天 抖音版')).toBe(normaliseTitle('晴天'));
  });

  it('ignores punctuation, case and width, and folds traditional into simplified', () => {
    expect(normaliseTitle('Let It Go!')).toBe(normaliseTitle('let it go'));
    expect(normaliseTitle('ＡＢＣ')).toBe('abc');
    expect(normaliseTitle('後來')).toBe(normaliseTitle('后来'));
  });

  it('is empty when nothing is left', () => {
    expect(normaliseTitle('（伴奏）')).toBe('');
    expect(normaliseTitle(' - live')).toBe('');
  });
});

describe('displayTitle', () => {
  it('keeps case and punctuation but drops versions', () => {
    expect(displayTitle("Don't Stop (Live)")).toBe("Don't Stop");
    expect(displayTitle('一番の宝物 ～Yui final ver.～')).toBe('一番の宝物');
    expect(displayTitle('后来 - 抖音版')).toBe('后来');
    expect(displayTitle('知我 完整版')).toBe('知我');
  });
});

describe('foldArtist', () => {
  it('makes spellings of one singer one key', () => {
    expect(foldArtist('中島美嘉')).toBe(foldArtist('中岛美嘉'));
    expect(foldArtist('大塚 愛')).toBe(foldArtist('大塚爱'));
    expect(foldArtist('周杰倫')).toBe(foldArtist('周杰伦'));
    expect(foldArtist('周杰伦')).not.toBe(foldArtist('周杰'));
  });
});

describe('cleanLine', () => {
  it('keeps spaces between Latin words and drops them next to CJK', () => {
    expect(cleanLine('Hello, world  你好 吗！')).toBe('Hello world你好吗');
    expect(cleanLine("don't   stop")).toBe("don't stop");
  });
});
