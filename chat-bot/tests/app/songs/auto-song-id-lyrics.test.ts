import { SongSpans } from '../../../src/app/songs/song-spans';
import { AutoSongId } from '../../../src/app/songs/auto-song-id';
import { SongId } from '../../../src/app/songs/song-id';
import { Transcript, type TranscriptLine } from '../../../src/core/songs/transcript';
import { fakeRoom } from '../../support/fake-room';
import { fakeSettings } from '../../support/fake-settings';
import { silentLog } from '../../support/fakes';

/** Auto song id over a real SongId whose lyrics search answers `titles` in turn (and has no Codex). */
function setup(titles: string[]) {
  let now = 0;
  const transcript = new Transcript(Infinity, () => now);
  const sent: string[] = [];
  let codexAsked = 0;
  const songId = new SongId({
    prompt: () => '{{question}}|{{transcript}}',
    codex: () => {
      codexAsked++;
      return Promise.resolve('');
    },
    lyrics: () =>
      Promise.resolve({
        title: titles.shift() ?? '',
        artist: '周杰伦',
        sure: true,
        candidates: [],
        why: 'test',
        queries: ['a', 'b'],
        ms: 500,
      }),
    found: ({ title }) => `这首是《${title}》`,
    log: silentLog,
    now: () => now,
  });
  const auto = new AutoSongId({
    songId,
    room: fakeRoom({ transcript, now: () => now }),
    songSpans: new SongSpans({ sources: [] }),
    outbox: { push: ({ text }) => sent.push(text) },
    log: silentLog,
    settings: fakeSettings({ autoSongId: true }),
  });
  const line = async (at: number, text: string) => {
    now = at * 1000;
    const heard: TranscriptLine = { start: now - 3000, end: now, text, speech: 0.05 };
    transcript.add(heard);
    auto.hear(heard);
    await auto.idle();
  };
  return { line, sent, codexAsked: () => codexAsked };
}

test('says a song the lyrics search named, without Codex, and not the same song again in another spelling', async () => {
  const { line, sent, codexAsked } = setup(['晴天', '晴天 (Live)', '七里香']);
  // Seven minutes of singing without a pause: asked every 3 minutes.
  for (let t = 0; t <= 420; t += 10) await line(t, `歌词${t}`);

  expect(sent).toEqual(['这首是《晴天》', '这首是《七里香》']);
  expect(codexAsked()).toBe(0);
});
