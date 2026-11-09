import type { Singer } from '../../core/songs/song-answer';
import {
  isHandled,
  singingNow,
  singingSong,
  type TranscriptLine,
} from '../../core/songs/transcript';
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
  /**
   * Whether the song naming on its own (/自动识歌) is on, so the message waits for it to say who
   * is singing (see `singer`); without it, the voices alone tell.
   */
  awaitsSinger?: () => boolean;
  /** How long the message waits for who is singing, before the voices alone tell. */
  waitMs?: number;
  /** While the streamer goes on singing, take this long as the next song. */
  againMs?: number;
  /** A number from 0 to 1, for whether the message is sent for a song. */
  random?: () => number;
}

/**
 * Sends the room's `on_sing` message (room_config.json) as the streamer starts a song, with its
 * probability: once they're singing (see singingNow), for each new song (after a
 * pause), and again every `againMs` while they go on singing, as one song runs into the next.
 *
 * The voices take a 连线 singing for the streamer often enough (缇娅's room cheered her during
 * 小夜曲's song), so while the song naming is on (`awaitsSinger`), the message waits for it to
 * make out who is singing from the talk and the chat (`singer`), and isn't sent for a guest's. With
 * no word by `waitMs`, it's sent if the streamer is still singing.
 */
export class OnSing {
  /** When the last song was rolled for. */
  private rolledAt = -Infinity;
  /** The song whose message waits for who is singing: when it started, and when it was rolled for. */
  private waiting: { start: number; at: number } | undefined;

  constructor(private readonly options: OnSingOptions) {}

  /** Called with each line the streamer says or sings, after it joined the transcript. */
  hear(line: TranscriptLine): void {
    const { room, log, againMs = 180_000, waitMs = 120_000, random = Math.random } = this.options;
    const config = this.options.config();
    if (!config) return;
    const transcript = room.recentTranscript();
    const song = singingSong(transcript, line, this.options.songSpans?.of(transcript));
    if (this.waiting && line.end - this.waiting.at >= waitMs) {
      this.waiting = undefined;
      // A word said between verses doesn't end the song: the last minute does tell.
      if (singingNow(transcript, line.end)) {
        log.info('on sing: nobody said who is singing, sent');
        this.send();
      } else log.info('on sing: nobody said who is singing, and the song is over');
    }
    if (!song || isHandled(song, this.rolledAt, line.end, againMs)) return;
    this.rolledAt = line.end;
    this.waiting = undefined;
    if (random() >= config.probability) {
      log.info('on sing: not this song');
      return;
    }
    if (this.options.awaitsSinger?.()) this.waiting = { start: song.start, at: line.end };
    else this.send();
  }

  /**
   * Who the song naming made out to be singing the song that started at `songStart` (undefined
   * when it couldn't ask, or failed): a message waiting for that song is sent, unless a guest is
   * singing. Word on an earlier song (asked about before this one started) is no word on this one.
   */
  singer(singer: Singer | undefined, songStart: number): void {
    if (!this.waiting || songStart < this.waiting.start) return;
    this.waiting = undefined;
    if (singer === 'guest') {
      this.options.log.info('on sing: a guest is singing, not sent');
      return;
    }
    this.send();
  }

  private send(): void {
    const config = this.options.config();
    if (config) this.options.outbox.push({ kind: 'talk', text: config.message });
  }
}
