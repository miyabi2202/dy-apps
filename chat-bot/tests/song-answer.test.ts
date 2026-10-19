import { parseSongAnswer } from '../src/core/song-answer';

test('reads a song answer, and rejects anything else', () => {
  expect(
    parseSongAnswer('{"message":"是《あぶく》","title":"あぶく","artist":"ヨルシカ","sure":true}'),
  ).toEqual({
    message: '是《あぶく》',
    title: 'あぶく',
    artist: 'ヨルシカ',
    sure: true,
  });
  expect(parseSongAnswer('{"message":"没认出来"}')).toEqual({
    message: '没认出来',
    title: '',
    artist: '',
    sure: false,
  });
  expect(
    parseSongAnswer('{"message":"像《刀剑如梦》？","title":"刀剑如梦","sure":false}')?.sure,
  ).toBe(false);
  expect(parseSongAnswer('弹幕：没认出来')).toBeNull();
  expect(parseSongAnswer('{"title":"ALWAYS"}')).toBeNull();
});
