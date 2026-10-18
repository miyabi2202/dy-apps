import { parseJLyricResults } from '../src/adapters/j-lyric';
import { candidates, clearWinner, lyricFragments, parseSongAnswer } from '../src/core/lyrics';

const song = (title: string, artist = '中島美嘉') => ({
  title,
  artist,
  url: `https://j-lyric.net/${title}`,
});

test('cuts the last Japanese lines sung into fragments, newest first', () => {
  expect(
    lyricFragments([
      '我会把甜蜜的', // not Japanese
      '何もかもが今色褪せて見えるこの世界に。',
      'LA LA',
      '例えば、誰かきついても迷わず駆け出しで今すぐ。',
    ]),
  ).toEqual([
    '誰かきついても',
    '迷わず駆け出し',
    'け出しで今すぐ',
    '何もかもが今色',
    '褪せて見えるこ',
    'えるこの世界に',
  ]);
  expect(lyricFragments(['短い', 'HELLO'])).toEqual([]);
});

test('names a song only when twice as many fragments found it as any other', () => {
  const always = song('ALWAYS');
  const climb = song('climb up', '水樹奈々');
  const songs = candidates([[always, climb], [always], [always, always], []]);
  expect(songs.map((s) => [s.title, s.fragments])).toEqual([
    ['ALWAYS', 3],
    ['climb up', 1],
  ]);
  expect(clearWinner(songs)?.title).toBe('ALWAYS');

  // One fragment isn't enough, nor 3 to 2, and a cover found as often is a tie.
  expect(clearWinner(candidates([[always, climb], [always, climb], [always]]))).toBeNull();
  expect(clearWinner(candidates([[always]]))).toBeNull();
  const cover = song('ALWAYS', '歌ってみた');
  expect(
    clearWinner(
      candidates([
        [always, cover],
        [always, cover],
      ]),
    ),
  ).toBeNull();
});

test("reads the songs off j-lyric's results page", () => {
  const html =
    '<div class="bdy"><p class="mid"><a href="/artist/a000621/l01e18a.html" title="中島美嘉 ALWAYS 歌詞">ALWAYS</a></p><p class="sml">歌：<a href="/artist/a000621/" title="中島美嘉 歌詞リスト">中島美嘉</a></p><p class="sml">歌詞：...</p></div>' +
    '<div class="bdy"><p class="mid"><a href="/artist/a1/l2.html">Tom &amp; Jerry</a></p><p class="sml">歌：<a href="/artist/a1/">A&amp;B</a></p></div>';
  expect(parseJLyricResults(html)).toEqual([
    { title: 'ALWAYS', artist: '中島美嘉', url: 'https://j-lyric.net/artist/a000621/l01e18a.html' },
    { title: 'Tom & Jerry', artist: 'A&B', url: 'https://j-lyric.net/artist/a1/l2.html' },
  ]);
});

test('reads a song answer, and rejects anything else', () => {
  expect(
    parseSongAnswer('{"message":"是《あぶく》","title":"あぶく","artist":"ヨルシカ"}'),
  ).toEqual({
    message: '是《あぶく》',
    title: 'あぶく',
    artist: 'ヨルシカ',
  });
  expect(parseSongAnswer('{"message":"没认出来"}')).toEqual({
    message: '没认出来',
    title: '',
    artist: '',
  });
  expect(parseSongAnswer('弹幕：没认出来')).toBeNull();
  expect(parseSongAnswer('{"title":"ALWAYS"}')).toBeNull();
});
