import {
  lyricsBreak,
  lyricsIndex,
  lyricsMatcher,
  lyricUnits,
  matchShare,
} from '../../../src/core/songs/lyric-match';
import type { TranscriptLine } from '../../../src/core/songs/transcript';

/** The start of 《画廊游记》 as NetEase has it. */
const 画廊游记 = [
  '在一切开始的时分',
  '我推开了画廊的门',
  '捧着空白灵魂 迈步向画卷缤纷',
  '走过跃然纸上的晨昏',
  '七情六欲被轻轻一吻',
  '才唤醒了心神 让我能与自己相认',
  '一帧帧 时光在我面前被逐一定格',
  '望着满墙画作',
  '这双眼看到了什么',
];

/** The start of 《All Alone With You》. */
const ALL_ALONE = [
  '誰かを愛することなんてできるわけなくて',
  'だけど誰かに愛されたくて',
  '変わらない昨日がずっと続いてくんだ',
  'どこにも行けやしないんだ 私と君',
];

describe('lyricUnits', () => {
  it('turns Chinese into pinyin with mixed-up sounds merged, so homophones are the same', () => {
    expect(lyricUnits('我唱歌')).toEqual(lyricUnits('我常歌'));
    expect(lyricUnits('畫廊遊記')).toEqual(lyricUnits('画廊游记'));
  });

  it('keeps Latin words whole and kana one by one, without punctuation', () => {
    expect(lyricUnits("WHISKEY的度数, you're")).toEqual(['whiskey', 'de', 'du', 'su', 'youre']);
    expect(lyricUnits('あなたと。')).toEqual(['あ', 'な', 'た', 'と']);
  });
});

describe('matchShare', () => {
  const index = lyricsIndex(画廊游记);

  it("matches a sung line cut across the lyrics' own line breaks", () => {
    expect(matchShare('捧着空白灵魂迈步向画卷', index)).toBe(1);
    expect(matchShare('七情六欲被轻轻一吻才唤醒了心神让我能与子', index)).toBeGreaterThan(0.9);
  });

  it('matches what speech recognition misheard as homophones (花廊 for 画廊, 子 for 自)', () => {
    expect(matchShare('在一切开始的时分我推开了花廊的门', index)).toBeGreaterThan(0.8);
  });

  it("doesn't match another song's line", () => {
    expect(matchShare('海风吹过的夏天仿佛从来我都在你身上', index)).toBeLessThan(0.2);
  });

  it('is undefined for a line with no pair', () => {
    expect(matchShare('嗯', index)).toBeUndefined();
    expect(matchShare('YEAH', index)).toBeUndefined();
  });

  it("matches Japanese as heard, kanji and kana, against the song's lyrics", () => {
    const japanese = lyricsIndex(ALL_ALONE);
    expect(
      matchShare('誰かを愛することなんでできるわけけなくてだけど誰かに愛されたくて。', japanese),
    ).toBeGreaterThan(0.8);
    expect(matchShare('在一切开始的时分我推开了花廊的门', japanese)).toBe(0);
  });
});

describe('lyricsBreak', () => {
  let clock = 0;
  /** A line heard next, 10 s after the last; sung unless `speech` says otherwise. */
  const heard = (text: string, speech = 0.05): TranscriptLine => {
    clock += 10_000;
    return { start: clock - 8_000, end: clock, text, speech };
  };
  const known = { since: 0, matches: lyricsMatcher(画廊游记) };
  beforeEach(() => (clock = 0));

  it('ends the song at the first of two misses in a row, whoever sang them', () => {
    const lines = [
      heard('在一切开始的时分我推开了花廊的门'),
      heard('走过跃然纸上的晨昏七情六欲'),
      heard('海风吹过的夏天仿佛从来我都在你身上'),
      { ...heard('看见我孩子般微笑的脸再靠近一点'), host: false },
      heard('我是否用心发现你猜我也想靠近吧'),
    ];
    expect(lyricsBreak(lines, known)).toBe(lines[2]);
  });

  it('goes on through a single miss, short lines and talk', () => {
    const lines = [
      heard('在一切开始的时分我推开了花廊的门'),
      heard('福建过眼风一二三四'),
      heard('哼哼哼'),
      heard('YEAH'),
      heard('欢迎月神晚上好谢谢月神的灯牌', 0.9),
      heard('欢迎松鹤欢迎咖喱棒回来', 0.9),
      heard('一阵阵时光在我面前被逐一定格'),
      heard('福建过眼风一二三四'),
    ];
    expect(lyricsBreak(lines, known)).toBeUndefined();
  });

  it('checks only lines after the song was named', () => {
    const before = [heard('海风吹过的夏天仿佛从来'), heard('看见我孩子般微笑的脸')];
    const after = [heard('望着满墙画作这双眼看到了什么')];
    expect(lyricsBreak([...before, ...after], { ...known, since: clock - 5_000 })).toBeUndefined();
  });

  it('with heal, undoes a break when the song is sung again, and breaks again after', () => {
    const garbled = [heard('GONNA TREAT YOU WELL'), heard('谢谢大家的点赞我们点赞到一万啦')];
    const again = heard('望着满墙画作这双眼看到了什么');
    expect(lyricsBreak([...garbled, again], known)).toBe(garbled[0]);
    expect(lyricsBreak([...garbled, again], known, { heal: true })).toBeUndefined();
    const next = [heard('海风吹过的夏天仿佛从来'), heard('看见我孩子般微笑的脸')];
    expect(lyricsBreak([...garbled, again, ...next], known, { heal: true })).toBe(next[0]);
    // Lines missing after the break don't move it.
    const more = [heard('再靠近一点幸福无限蔓延'), heard('心开始悄悄在改变')];
    expect(lyricsBreak([...next, ...more], known, { heal: true })).toBe(next[0]);
  });

  it('takes the miss count and the shortest line checked as options', () => {
    const lines = [heard('海风吹过的夏天'), heard('晚安前想念')];
    expect(lyricsBreak(lines, known, { misses: 1 })).toBe(lines[0]);
    expect(lyricsBreak(lines, known)).toBeUndefined();
    expect(lyricsBreak(lines, known, { minChars: 5 })).toBe(lines[0]);
  });
});
