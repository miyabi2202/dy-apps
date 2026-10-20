import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import { isHandled, isSung, singingSong, type TranscriptLine } from '../core/transcript';
import { done, failed, type Command } from './command';
import type { Outbox } from './outbox';
import type { Log } from './ports';
import type { RoomState } from './room-state';
import type { SongId } from './song-id';

export interface AutoSongIdOptions {
  songId: Pick<SongId, 'prompt' | 'name' | 'namedAt' | 'lastTold' | 'told'>;
  room: RoomState;
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** Whether it starts on; `/自动识歌` switches it. */
  on?: boolean;
  /** Douyin's chat length limit. */
  maxLength?: number;
  /** While the streamer goes on singing, name the song again this often, for the next song. */
  againMs?: number;
  /** How soon it tries again when it found the song it named last, still being sung. */
  sameAgainMs?: number;
  /** A song named this recently isn't named again. */
  repeatMs?: number;
}

/** Sung lines a song needs before it's named, for enough lyrics to go on. */
const SONG_LINES = 5;

/** What the prompt's `{{question}}` says when nobody asked. */
const UNASKED =
  '没人问，是你听到主播在唱歌，主动告诉直播间这首是什么歌（不用 @ 谁）。只有找到歌词核对过、确定是这首时才填 title；不确定或认不出来，title 和 artist 都留空（这次就不会发出去）。';

/**
 * What's added to UNASKED when it told the room a song within `repeatMs`: the model, not the
 * title, tells whether it's still that song (a version's name is often written another way).
 */
function lastSongNote(title: string, artist: string, minutes: number): string {
  const who = artist ? `（${artist}）` : '';
  return `你 ${minutes} 分钟前已经说过这首是《${title}》${who}。这次认出来的如果还是这首（哪怕版本、写法不一样），很可能主播还在唱同一首：title 和 artist 照常填，message 留空字符串，不要再说；只有上次说错了、需要更正时才写 message，并说明是更正。`;
}

/**
 * Names the song the streamer is singing without anyone asking, like `/识歌`, and says it in the
 * room: once the streamer is singing (see singingNow) and the song has SONG_LINES sung lines, and
 * again every `againMs` while they go on singing, as one song runs into the next. Only a song the
 * model names for sure is said, and not one named (by it or by `/识歌`) within `repeatMs`; when
 * it finds that one still being sung, it looks again after `sameAgainMs` instead.
 */
export class AutoSongId {
  on: boolean;
  /** When it last tried. */
  private triedAt = -Infinity;
  /** How long after `triedAt` it tries again while the streamer sings on. */
  private waitMs: number | undefined;
  private busy = false;

  constructor(private readonly options: AutoSongIdOptions) {
    this.on = options.on ?? false;
  }

  /** Called with each line the streamer says or sings, after it joined the transcript. */
  hear(line: TranscriptLine): void {
    if (!this.on || this.busy) return;
    const { room, againMs = 180_000 } = this.options;
    const song = singingSong(room.recentTranscript(), line);
    if (!song || song.lines.filter(isSung).length < SONG_LINES) return;
    // Again only once a new song started (after a pause), or after `againMs` of singing on.
    if (isHandled(song, this.triedAt, line.end, this.waitMs ?? againMs)) return;
    this.triedAt = line.end;
    this.busy = true;
    void this.nameSong(song.lines).finally(() => (this.busy = false));
  }

  /** `/自动识歌 1` turns it on, `/自动识歌 0` off. */
  commands(): Command[] {
    return [
      {
        name: '自动识歌',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (args !== '0' && args !== '1') {
            return failed('要写 0（关闭）或 1（打开），用法：/自动识歌 1');
          }
          this.on = args === '1';
          this.options.log.info('auto song id', { on: this.on });
          return done('已处理自动识歌请求');
        },
      },
    ];
  }

  /** UNASKED, and the song it last told the room when that was within `repeatMs`. */
  private question(repeatMs: number): string {
    const last = this.options.songId.lastTold();
    const ago = last && this.options.room.now() - last.at;
    if (!last || ago === undefined || ago >= repeatMs) return UNASKED;
    const minutes = Math.max(1, Math.round(ago / 60_000));
    return UNASKED + lastSongNote(last.song.title, last.song.artist, minutes);
  }

  private async nameSong(song: TranscriptLine[]): Promise<void> {
    const {
      songId,
      room,
      outbox,
      log,
      maxLength = DOUYIN_CHAT_LIMIT,
      repeatMs = 60 * 60_000,
      sameAgainMs = 60_000,
    } = this.options;
    this.waitMs = undefined;
    try {
      const prompt = room.prompt(songId.prompt(), {
        transcript: song,
        asker: '直播间',
        question: this.question(repeatMs),
        singleLength: maxLength,
        maxLength,
      });
      const { answer } = await songId.name({ prompt });
      // Only a song it's sure of is said: a guess (「听着像…不太确定」) isn't.
      if (!answer?.title || !answer.sure) {
        log.info('auto song id found nothing sure', { title: answer?.title });
        return;
      }
      const last = songId.namedAt(answer.title);
      const text = plainMessage(answer.message, maxLength);
      if (!text || (last !== undefined && room.now() - last < repeatMs)) {
        // Still the song it named: she may move on soon, so it looks again sooner.
        this.waitMs = sameAgainMs;
        log.info('auto song id: still the song told lately', { title: answer.title });
        return;
      }
      outbox.push({ kind: 'talk', text });
      songId.told(answer);
    } catch (err) {
      log.warn('auto song id failed', { error: errorMessage(err) });
    }
  }
}
