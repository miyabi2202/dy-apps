import { errorMessage } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import { currentSong, isGuest, isSung, singingNow, type TranscriptLine } from '../core/transcript';
import { done, failed, type Command } from './command';
import type { Outbox } from './outbox';
import type { Log } from './ports';
import type { RoomState } from './room-state';
import type { SongId } from './song-id-command';

export interface AutoSongIdOptions {
  songId: Pick<SongId, 'prompt' | 'name' | 'namedAt' | 'told'>;
  room: RoomState;
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** Whether it starts on; `/自动识歌` switches it. */
  on?: boolean;
  /** Douyin's chat length limit. */
  maxLength?: number;
  /** While the streamer goes on singing, name the song again this often, for the next song. */
  againMs?: number;
  /** A song named this recently isn't named again. */
  repeatMs?: number;
}

/** Sung lines a song needs before it's named, for enough lyrics to go on. */
const SONG_LINES = 5;

/** What the prompt's `{{question}}` says when nobody asked. */
const UNASKED =
  '没人问，是你听到主播在唱歌，主动告诉直播间这首是什么歌（不用 @ 谁）。只有找到歌词核对过、确定是这首时才填 title；不确定或认不出来，title 和 artist 都留空（这次就不会发出去）。';

/**
 * Names the song the streamer is singing without anyone asking, like `/识歌`, and says it in the
 * room: once the streamer is singing (see singingNow) and the song has SONG_LINES sung lines, and
 * again every `againMs` while they go on singing, as one song runs into the next. Only a song the
 * model names for sure is said, and not one named (by it or by `/识歌`) within `repeatMs`.
 */
export class AutoSongId {
  on: boolean;
  /** When it last tried. */
  private triedAt = -Infinity;
  private busy = false;

  constructor(private readonly options: AutoSongIdOptions) {
    this.on = options.on ?? false;
  }

  /** Called with each line the streamer says or sings, after it joined the transcript. */
  hear(line: TranscriptLine): void {
    if (!this.on || this.busy || !isSung(line) || isGuest(line)) return;
    const { room, againMs = 180_000 } = this.options;
    const lines = room.recentTranscript().filter((l) => !isGuest(l));
    const song = currentSong(lines);
    if (song.filter(isSung).length < SONG_LINES || !singingNow(lines, line.end)) return;
    // Again only once a new song started (after a pause), or after `againMs` of singing on. The
    // song's start can't be compared: it moves as its first lines drop out of the transcript.
    const songStart = song.find(isSung)?.start ?? line.start;
    if (songStart <= this.triedAt && line.end - this.triedAt < againMs) return;
    this.triedAt = line.end;
    this.busy = true;
    void this.nameSong(song).finally(() => (this.busy = false));
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

  private async nameSong(song: TranscriptLine[]): Promise<void> {
    const {
      songId,
      room,
      outbox,
      log,
      maxLength = DOUYIN_CHAT_LIMIT,
      repeatMs = 60 * 60_000,
    } = this.options;
    try {
      const prompt = buildPrompt(songId.prompt(), {
        ...room.promptInput(),
        transcript: song,
        asker: '直播间',
        question: UNASKED,
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
      if (last !== undefined && room.now() - last < repeatMs) {
        log.info('auto song id: told lately', { title: answer.title });
        return;
      }
      const text = plainMessage(answer.message, maxLength);
      if (!text) return;
      outbox.push({ kind: 'talk', text });
      songId.told(answer);
    } catch (err) {
      log.warn('auto song id failed', { error: errorMessage(err) });
    }
  }
}
