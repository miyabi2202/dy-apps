import { parseSongAnswer } from '../src/core/song-answer';

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
