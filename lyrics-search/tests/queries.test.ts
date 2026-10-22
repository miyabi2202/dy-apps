import { lyricQueries } from '../src/queries';

describe('lyricQueries', () => {
  it('drops lines under 4 characters and duplicates', () => {
    expect(lyricQueries(['故事的小黄花', '你好', '故事的小黄花', 'ab c'])).toEqual([
      '故事的小黄花',
    ]);
  });

  it('keeps the 5 longest lines, longest first, stable among equals', () => {
    const lines = [
      '一二三四五',
      '一二三四五六七',
      '甲乙丙丁戊',
      '子丑寅卯辰',
      '天地玄黄宇宙',
      '日月盈昃辰宿',
      '金木水火土',
    ];
    expect(lyricQueries(lines)).toEqual([
      '一二三四五六七',
      '天地玄黄宇宙',
      '日月盈昃辰宿',
      '一二三四五',
      '甲乙丙丁戊',
    ]);
  });

  it('cuts a line at 20 characters', () => {
    expect(lyricQueries(['一二三四五六七八九十一二三四五六七八九十甲乙'])).toEqual([
      '一二三四五六七八九十一二三四五六七八九十',
    ]);
  });

  it('cuts a long Latin line at a word', () => {
    const [query] = lyricQueries(['we are the champions my friends and we will keep on fighting']);
    expect(query).toBe('we are the champions my friends');
  });

  it('skips lines marked as not sung, and counts strings as sung', () => {
    expect(
      lyricQueries([
        { text: '主播在说话呢', sung: false },
        { text: '唱出来的歌词', sung: true },
        '另一句歌词啊',
      ]),
    ).toEqual(['唱出来的歌词', '另一句歌词啊']);
  });
});
