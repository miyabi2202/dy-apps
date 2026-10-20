import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import type { SongAnswer } from '../core/song-answer';
import { isHandled, isSung, singingSong, type TranscriptLine } from '../core/transcript';
import { done, failed, type Command } from './command';
import { ModelFeature } from './model-feature';
import type { Outbox } from './outbox';
import { Pending } from './pending';
import type { Log, SettingsStore } from './ports';
import { setting } from './setting';
import type { RoomState } from './room-state';
import type { SongId } from './song-id';

export interface AutoSongIdOptions {
  songId: Pick<SongId, 'prompt' | 'name' | 'namedAt' | 'lastTold' | 'told'>;
  room: RoomState;
  outbox: Pick<Outbox, 'push'>;
  log: Log;
  /** Whether it starts on; `/自动识歌` switches it. Without `settings`, what it starts as. */
  on?: boolean;
  /** The room's settings, where it's kept (`autoSongId`). */
  settings?: SettingsStore;
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

/**
 * Names the song the streamer is singing without anyone asking, like `/识歌`, and says it in the
 * room: once the streamer is singing (see singingNow) and the song has SONG_LINES sung lines, and
 * again every `againMs` while they go on singing, as one song runs into the next. Only a song the
 * model names for sure is said, and not one named (by it or by `/识歌`) within `repeatMs`; when
 * it finds that one still being sung, it looks again after `sameAgainMs` instead.
 */
export class AutoSongId extends ModelFeature<TranscriptLine[], SongAnswer | null> {
  private readonly onSetting: ReturnType<typeof setting<'autoSongId'>>;
  /** When it last tried. */
  private triedAt = -Infinity;
  /** How long after `triedAt` it tries again while the streamer sings on. */
  private waitMs: number | undefined;
  private busy = false;
  private readonly work = new Pending();

  constructor(private readonly options: AutoSongIdOptions) {
    super(options.log);
    this.onSetting = setting(options.settings, 'autoSongId', options.on ?? false);
  }

  /** Whether it names the songs; admins switch it while the bot runs. */
  get on(): boolean {
    return this.onSetting.get();
  }

  set on(on: boolean) {
    this.onSetting.set(on);
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
    this.work.track(this.nameSong(song.lines).finally(() => (this.busy = false)));
  }

  /** Resolves once the song being named has been told to the room, or has failed. */
  idle(): Promise<void> {
    return this.work.idle();
  }

  /** What `{{settings}}` says of it: whether it's on. */
  settings(): { autoSongId: boolean } {
    return { autoSongId: this.on };
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

  /** What nobody asked, and the song it last told the room when that was within `repeatMs`. */
  private question(repeatMs: number): string {
    const last = this.options.songId.lastTold();
    const ago = last && this.options.room.now() - last.at;
    const { wording } = this.options.room;
    // What the prompt's `{{question}}` says when nobody asked.
    const unasked = wording('song-unasked');
    if (!last || ago === undefined || ago >= repeatMs) return unasked;
    // When it told the room a song within `repeatMs`, the model, not the title, tells whether it's
    // still that song (a version's name is often written another way).
    const minutes = Math.max(1, Math.round(ago / 60_000));
    const { title, artist } = last.song;
    return (
      unasked + wording('song-last', { minutes, title, artist: artist ? `（${artist}）` : '' })
    );
  }

  private nameSong(song: TranscriptLine[]): Promise<void> {
    this.waitMs = undefined;
    return this.run(song);
  }

  protected buildPrompt(song: TranscriptLine[]): string {
    const { songId, room, maxLength = DOUYIN_CHAT_LIMIT, repeatMs = 60 * 60_000 } = this.options;
    return room.prompt(songId.prompt(), {
      transcript: song,
      asker: '直播间',
      question: this.question(repeatMs),
      singleLength: maxLength,
      maxLength,
    });
  }

  /** The song it named, or null when the answer isn't one (logged by SongId). */
  protected async ask(_song: TranscriptLine[], prompt: string): Promise<SongAnswer | null> {
    return (await this.options.songId.name({ prompt })).answer;
  }

  protected deliver(_song: TranscriptLine[], answer: SongAnswer | null): void {
    const {
      songId,
      room,
      outbox,
      log,
      maxLength = DOUYIN_CHAT_LIMIT,
      repeatMs = 60 * 60_000,
      sameAgainMs = 60_000,
    } = this.options;
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
  }

  protected failed(_song: TranscriptLine[], err: unknown): void {
    this.options.log.warn('auto song id failed', { error: errorMessage(err) });
  }
}
