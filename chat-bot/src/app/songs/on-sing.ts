import { isHandled, singingSong, type TranscriptLine } from '../../core/songs/transcript';
import type { Outbox } from '../replies/outbox';
import type { Log, OnSingConfig } from '../ports';
import type { RoomState } from '../room/room-state';
import type { SongSpans } from './song-spans';

export interface OnSingOptions {
  /** The room's `on_sing` as it is now (room_config.json, read again as it changes). */
  config: () => OnSingConfig | undefined;
  room: Pick<RoomState, 'recentTranscript'>;
  /** Where the songs in the transcript begin and end; without it only pauses and talk do. */
  songSpans?: Pick<SongSpans, 'of'>;
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** While the streamer goes on singing, take this long as the next song. */
  againMs?: number;
  /** A number from 0 to 1, for whether the message is sent for a song. */
  random?: () => number;
}

/**
 * Sends the room's `on_sing` message (room_config.json) as the streamer starts a song, with its
 * probability: once they're singing (see singingNow), for each new song (after a
 * pause), and again every `againMs` while they go on singing, as one song runs into the next.
 */
export class OnSing {
  /** When the last song was rolled for. */
  private rolledAt = -Infinity;

  constructor(private readonly options: OnSingOptions) {}

  /** Called with each line the streamer says or sings, after it joined the transcript. */
  hear(line: TranscriptLine): void {
    const { room, outbox, log, againMs = 180_000, random = Math.random } = this.options;
    const config = this.options.config();
    if (!config) return;
    const transcript = room.recentTranscript();
    const song = singingSong(transcript, line, this.options.songSpans?.of(transcript));
    if (!song || isHandled(song, this.rolledAt, line.end, againMs)) return;
    this.rolledAt = line.end;
    if (random() >= config.probability) {
      log.info('on sing: not this song');
      return;
    }
    outbox.push({ kind: 'talk', text: config.message });
  }
}
