import { AutoSongId, SONG_CHARS } from '../app/songs/auto-song-id';
import { BackingGapBreaks } from '../app/songs/backing-gap-breaks';
import { LyricsBreaks } from '../app/songs/lyrics-breaks';
import { ShazamBreaks } from '../app/songs/shazam-breaks';
import { OnSing } from '../app/songs/on-sing';
import { SongEnds } from '../app/songs/song-ends';
import { SongId } from '../app/songs/song-id';
import { candidateHints } from '../core/songs/song-candidates';
import { SongIntro } from '../app/songs/song-intro';
import type { Container } from './container';
import {
  ASK_CLAUDE,
  ASK_CODEX,
  AUTO_SONG_ID,
  BACKING_GAP_BREAKS,
  BUS,
  FETCH_LYRICS,
  LOG,
  LYRICS_BREAKS,
  LYRICS_SEARCH,
  ON_SING,
  RECORD,
  OPTIONS,
  OUTBOX,
  PROMPT,
  ROOM,
  ROOM_CONFIG,
  SETTINGS,
  SHAZAM_BREAKS,
  SONG_ENDS,
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
    // /识歌 and /自动识歌: Shazam while she sings, then the lyrics search, then Codex (which searches
    // with Google) when it isn't sure; without Codex, none of them.
    .register(SONG_ID, (c) => {
      if (!c.resolve(OPTIONS).codex) return null;
      // Made now, so a missing song-intro.md stops the bot at start.
      const songIntro = c.resolve(SONG_INTRO);
      const transcriber = c.resolve(TRANSCRIBER);
      const lyricsBreaks = c.resolve(LYRICS_BREAKS);
      return new SongId({
        prompt: c.resolve(PROMPT)('songId'),
        codex: c.resolve(ASK_CODEX)('song-id', {
          // Low sometimes answered without searching at all; medium always searched, ~8 s slower.
          effort: 'medium',
        }),
        log: c.resolve(LOG),
        // Shazam answers in a second or two; a slow one gives way to the lyrics.
        ...(transcriber && { music: () => transcriber.identifyMusic(10_000) }),
        // NetEase's lyrics search first: Codex only when it isn't sure of the title or names no singer.
        lyrics: c.resolve(LYRICS_SEARCH) ?? undefined,
        found: ({ title, artist }) =>
          c.resolve(ROOM).wording('song-found', { title, artist: artist ? `${artist}的` : '' }),
        hints: (candidates) =>
          c.resolve(ROOM).wording('song-candidates', { candidates: candidateHints(candidates) }),
        othersNote: () => c.resolve(ROOM).wording('song-others'),
        // Each song named, by any path, has its lyrics end it (see LyricsBreaks).
        ...(lyricsBreaks && {
          onNamed: (song, askedAt) => lyricsBreaks.keep(song, askedAt),
        }),
        onTold: (song) => void songIntro.introduce(song),
        // Too little sung to go on: said so, without asking Codex (see wording.md).
        early: {
          minChars: SONG_CHARS,
          noLyrics: () => c.resolve(ROOM).wording('song-no-lyrics'),
          tooEarly: (heard) => c.resolve(ROOM).wording('song-too-early', { heard }),
        },
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
    // Where songs start beyond pauses and talk (see song-breaks.ts), ranked in the order they're
    // added to the room: first the lyrics of the song named last, from NetEase.
    .register(LYRICS_BREAKS, (c) => {
      const fetchLyrics = c.resolve(FETCH_LYRICS);
      if (!fetchLyrics) return null;
      const lyricsBreaks = new LyricsBreaks({ fetchLyrics, log: c.resolve(LOG) });
      c.resolve(ROOM).addSongBreaks(lyricsBreaks);
      return lyricsBreaks;
    })
    // Then the backing track's title, as Shazam names it on the whole mix (the speech worker's
    // BackingTitles add-on). Made after the lyrics, so it ranks below them.
    .register(SHAZAM_BREAKS, (c) => {
      c.resolve(LYRICS_BREAKS);
      const shazamBreaks = new ShazamBreaks({ log: c.resolve(LOG) });
      c.resolve(ROOM).addSongBreaks(shazamBreaks);
      return shazamBreaks;
    })
    // Then the backing track stopping between songs (the worker's BackingGaps add-on), fed its
    // backing levels.
    .register(BACKING_GAP_BREAKS, (c) => {
      c.resolve(SHAZAM_BREAKS);
      const backingGapBreaks = new BackingGapBreaks({ log: c.resolve(LOG) });
      c.resolve(ROOM).addSongBreaks(backingGapBreaks);
      c.resolve(BUS).on('backing-level', (level) => backingGapBreaks.add(level));
      return backingGapBreaks;
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
    })
    // And a line in the chat record each time a song the streamer sang ended.
    .register(SONG_ENDS, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      const songId = c.resolve(SONG_ID);
      const songEnds = new SongEnds({
        room: c.resolve(ROOM),
        record: c.resolve(RECORD),
        ...(songId && { lastTold: () => songId.lastTold() }),
        timeZone: () => roomConfig().timeZone,
      });
      c.resolve(BUS).on('heard', (line) => songEnds.hear(line));
      return songEnds;
    });
}
