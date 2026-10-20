import { AutoSongId } from '../app/auto-song-id';
import { OnSing } from '../app/on-sing';
import { SongId } from '../app/song-id';
import { SongIntro } from '../app/song-intro';
import type { Container } from './container';
import {
  ASK_CLAUDE,
  ASK_CODEX,
  AUTO_SONG_ID,
  BUS,
  LOG,
  ON_SING,
  OPTIONS,
  OUTBOX,
  PROMPT,
  ROOM,
  ROOM_CONFIG,
  SETTINGS,
  SONG_ID,
  SONG_INTRO,
  TRANSCRIBER,
} from './tokens';

/** Naming the songs the streamer sings, saying more about them, and cheering when one starts. */
export function registerSongs(container: Container): void {
  container
    // Once a song is named, may say up to two more things about it, or nothing.
    .register(
      SONG_INTRO,
      (c) =>
        new SongIntro({
          ask: c.resolve(ASK_CLAUDE)('song-intro'),
          outbox: c.resolve(OUTBOX),
          promptTemplate: c.resolve(PROMPT)('songIntro'),
          room: c.resolve(ROOM),
          log: c.resolve(LOG),
          maxLength: c.resolve(OPTIONS).maxReplyLength,
        }),
    )
    // /识歌 and /自动识歌: Codex, which searches with Google; without Codex, neither.
    .register(SONG_ID, (c) => {
      if (!c.resolve(OPTIONS).codex) return null;
      // Made now, so a missing song-intro.md stops the bot at start.
      const songIntro = c.resolve(SONG_INTRO);
      return new SongId({
        prompt: c.resolve(PROMPT)('songId'),
        codex: c.resolve(ASK_CODEX)('song-id', {
          // Low sometimes answered without searching at all; medium always searched, ~8 s slower.
          effort: 'medium',
        }),
        log: c.resolve(LOG),
        onTold: (song) => void songIntro.introduce(song),
      });
    })
    // And the streamer singing has the song named, when /自动识歌 (or --auto-song-id) turns it on.
    // It needs the stream to be listened to. The settings text says it's off when there's none.
    .register(AUTO_SONG_ID, (c) => {
      const options = c.resolve(OPTIONS);
      const room = c.resolve(ROOM);
      const songId = c.resolve(SONG_ID);
      const autoSongId =
        c.resolve(TRANSCRIBER) && songId
          ? new AutoSongId({
              songId,
              room,
              outbox: c.resolve(OUTBOX),
              log: c.resolve(LOG),
              on: options.autoSongId,
              settings: c.resolve(SETTINGS),
              maxLength: options.maxReplyLength,
            })
          : null;
      room.addSettings(() => autoSongId?.settings() ?? { autoSongId: false });
      const bus = c.resolve(BUS);
      bus.on('heard', (line) => autoSongId?.hear(line));
      return autoSongId;
    })
    // And, in a room with on_sing in its room_config.json, its message as the streamer starts a song.
    .register(ON_SING, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      const onSing = new OnSing({
        config: () => roomConfig().onSing,
        room: c.resolve(ROOM),
        outbox: c.resolve(OUTBOX),
        log: c.resolve(LOG),
      });
      c.resolve(BUS).on('heard', (line) => onSing.hear(line));
      return onSing;
    });
}
