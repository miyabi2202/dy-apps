import { candidateHints } from '../../../src/core/songs/song-candidates';

test("names NetEase's originals and covers when it marks them, else the top two singers", () => {
  expect(
    candidateHints([
      {
        title: '遇萤',
        score: 3,
        artists: ['CRITTY、橙光音乐', 'CRITTY', '执素兮'],
        originals: ['CRITTY', '执素兮', 'CRITTY、橙光音乐'],
        covers: ['只有影子', '李蚊香'],
      },
      { title: '晴天', score: 1, artists: ['周杰伦', '某人', '另一人'], originals: [], covers: [] },
      { title: '无名', score: 0.5, artists: [], originals: [], covers: [] },
    ]),
  ).toBe(
    '《遇萤》（原唱 CRITTY、执素兮；翻唱 只有影子、李蚊香）、《晴天》（周杰伦、某人）、《无名》',
  );
});
