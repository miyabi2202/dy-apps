import { busFeature } from '../app/feature';
import { AutoSongId, SONG_CHARS } from '../app/songs/auto-song-id';
import { BackingGapBreaks } from '../app/songs/backing-gap-breaks';
import { LyricsBreaks } from '../app/songs/lyrics-breaks';
import { ShazamBreaks } from '../app/songs/shazam-breaks';
import { OnSing } from '../app/songs/on-sing';
import { SongEnds } from '../app/songs/song-ends';
import { SongId } from '../app/songs/song-id';
import { candidateHints } from '../core/songs/song-candidates';
import type { Container } from './container';
import type { FeatureRegistry } from './features';
import {
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
  SONG_BREAK_SOURCES,
  SONG_ENDS,
  SONG_ID,
  TRANSCRIBER,
} from './tokens';

/** Naming the songs the streamer sings, and cheering when one starts. */
export function registerSongs(container: Container, features: FeatureRegistry): void {
  features
    // The streamer's lines, to whoever acts on them: the song named unasked, the on_sing message,
    // the chat record's line at a song's end, and the backing track's levels.
    .add('auto-song-id', (c) => {
      const autoSongId = c.resolve(AUTO_SONG_ID);
      return (
        autoSongId &&
        busFeature('auto-song-id', c.resolve(BUS), { heard: (line) => autoSongId.hear(line) })
      );
    })
    .add('on-sing', (c) => {
      const onSing = c.resolve(ON_SING);
      return busFeature('on-sing', c.resolve(BUS), { heard: (line) => onSing.hear(line) });
    })
    .add('song-ends', (c) => {
      const songEnds = c.resolve(SONG_ENDS);
      return busFeature('song-ends', c.resolve(BUS), { heard: (line) => songEnds.hear(line) });
    })
    .add('backing-gap-breaks', (c) => {
      const backingGapBreaks = c.resolve(BACKING_GAP_BREAKS);
      return busFeature('backing-gap-breaks', c.resolve(BUS), {
        'backing-level': (level) => backingGapBreaks.add(level),
      });
    });
  container
    // /识歌 and /自动识歌: Shazam while she sings, then the lyrics search, then Codex (which searches
    // with Google) when it isn't sure; without Codex, none of them.
    .register(SONG_ID, (c) => {
      if (!c.resolve(OPTIONS).codex) return null;
      const transcriber = c.resolve(TRANSCRIBER);
      const lyricsBreaks = c.resolve(LYRICS_BREAKS);
      const room = c.resolve(ROOM);
      return new SongId({
        prompt: c.resolve(PROMPT)('songId'),
        codex: c.resolve(ASK_CODEX)('song-id', {
          // On 10 of 虾虾's songs, sol told what each song is about more often than luna (the
          // --codex default), ~5 s slower. Low effort sometimes answered without searching at all;
          // medium always searched, ~8 s slower.
          model: 'gpt-6-sol',
          effort: 'medium',
        }),
        log: c.resolve(LOG),
        // Shazam answers in a second or two; a slow one gives way to the lyrics.
        ...(transcriber && { music: () => transcriber.identifyMusic(10_000) }),
        // NetEase's lyrics search first: Codex only when it isn't sure of the title or names no singer.
        lyrics: c.resolve(LYRICS_SEARCH) ?? undefined,
        found: ({ title, artist }) =>
          room.wording('song-found', { title, artist: artist ? `${artist}的` : '' }),
        // Codex writes the message to the room even for a song Shazam or the lyrics search named.
        known: ({ title, artist }) =>
          room.wording('song-known', { title, artist: artist || '不确定' }),
        hookNote: (on) => room.wording(on ? 'song-hook' : 'song-no-hook'),
        hints: (candidates) =>
          room.wording('song-candidates', { candidates: candidateHints(candidates) }),
        othersNote: () => room.wording('song-others'),
        // Each song named, by any path, has its lyrics end it (see LyricsBreaks).
        ...(lyricsBreaks && {
          onNamed: (song, askedAt) => lyricsBreaks.keep(song, askedAt),
        }),
        // Too little sung to go on: said so, without asking Codex (see wording.md).
        early: {
          minChars: SONG_CHARS,
          noLyrics: () => room.wording('song-no-lyrics'),
          tooEarly: (heard) => room.wording('song-too-early', { heard }),
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
              settings: c.resolve(SETTINGS),
              maxLength: options.maxReplyLength,
            })
          : null;
      return autoSongId;
    })
    // Where songs start beyond pauses and talk (see song-breaks.ts): the lyrics of the song named
    // last, from NetEase.
    .register(LYRICS_BREAKS, (c) => {
      const fetchLyrics = c.resolve(FETCH_LYRICS);
      if (!fetchLyrics) return null;
      return new LyricsBreaks({ fetchLyrics, log: c.resolve(LOG) });
    })
    // All of them, in the order they rank: the lyrics, then the backing track's title as Shazam
    // names it on the whole mix (the speech worker's BackingTitles add-on), then the backing
    // track stopping between songs (the worker's BackingGaps add-on), fed its backing levels.
    .register(SONG_BREAK_SOURCES, (c) => {
      const lyricsBreaks = c.resolve(LYRICS_BREAKS);
      const shazamBreaks = new ShazamBreaks({ log: c.resolve(LOG) });
      const backingGapBreaks = c.resolve(BACKING_GAP_BREAKS);
      return [...(lyricsBreaks ? [lyricsBreaks] : []), shazamBreaks, backingGapBreaks];
    })
    .register(BACKING_GAP_BREAKS, (c) => new BackingGapBreaks({ log: c.resolve(LOG) }))
    // And, in a room with on_sing in its room_config.json, its message as the streamer starts a song.
    .register(ON_SING, (c) => {
      const roomConfig = c.resolve(ROOM_CONFIG);
      const onSing = new OnSing({
        config: () => roomConfig().onSing,
        room: c.resolve(ROOM),
        outbox: c.resolve(OUTBOX),
        log: c.resolve(LOG),
      });
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
      return songEnds;
    });
}
