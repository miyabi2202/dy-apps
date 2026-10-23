import { errorMessage } from '../../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessages } from '../../core/replies/reply';
import type { SongAnswer } from '../../core/songs/song-answer';
import {
  isHandled,
  singingSong,
  sungChars,
  type TranscriptLine,
} from '../../core/songs/transcript';
import { ModelFeature } from '../models/model-feature';
import type { Outbox } from '../replies/outbox';
import { Pending } from '../pending';
import type { Log, SettingsStore } from '../ports';
import { setting } from '../commands/setting';
import type { RoomState } from '../room/room-state';
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

/**
 * Sung characters a song needs before it's named, for enough lyrics to go on: speech recognition
 * cuts singing into short pieces (「如果」「爱你」), so lines say little about how much was heard.
 */
export const SONG_CHARS = 40;
/** After an answer it isn't sure of, the same song is tried again once its lyrics are this many times as long… */
const RETRY_GROWTH = 2;
/** …this many times at most. */
const MAX_RETRIES = 2;

/**
 * Names the song the streamer is singing without anyone asking, like `/识歌`, and says it in the
 * room: once the streamer is singing (see singingNow) and the song (see currentSong) has
 * SONG_CHARS sung characters, and again every `againMs` while they go on singing, as one song runs
 * into the next. Only a song the model names for sure is said, and not one named (by it or by
 * `/识歌`) within `repeatMs`; when it finds that one still being sung, it looks again after
 * `sameAgainMs` instead. When it isn't sure, it asks again about the same song once its lyrics are
 * RETRY_GROWTH times as long, MAX_RETRIES times at most; a song that ended meanwhile isn't asked
 * about again, the new one is.
 */
export class AutoSongId extends ModelFeature<TranscriptLine[], SongAnswer | null> {
  private readonly onSetting: ReturnType<typeof setting<'autoSongId'>>;
  /** When it last tried. */
  private triedAt = -Infinity;
  /** How long after `triedAt` it tries again while the streamer sings on. */
  private waitMs: number | undefined;
  /** The lyrics it last asked about (sung characters), and how many times that song was asked again. */
  private asked = { chars: 0, retries: 0 };
  /** Whether the last answer wasn't sure, so the same song may be asked about again. */
  private unsure = false;
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
    if (!song) return;
    const chars = sungChars(song.lines);
    if (chars < SONG_CHARS) return;
    // The same song, not sure of it yet, with twice the lyrics to go on.
    const retry =
      song.start <= this.triedAt &&
      this.unsure &&
      this.asked.retries < MAX_RETRIES &&
      chars >= this.asked.chars * RETRY_GROWTH;
    // Otherwise again only once a new song started, or after `againMs` of singing on.
    if (!retry && isHandled(song, this.triedAt, line.end, this.waitMs ?? againMs)) return;
    this.asked = { chars, retries: retry ? this.asked.retries + 1 : 0 };
    this.triedAt = line.end;
    this.busy = true;
    this.work.track(
      this.nameSong(song.lines, retry ? 'retry' : 'auto').finally(() => (this.busy = false)),
    );
  }

  /** Resolves once the song being named has been told to the room, or has failed. */
  idle(): Promise<void> {
    return this.work.idle();
  }

  /** What `{{settings}}` says of it: whether it's on. */
  settings(): { autoSongId: boolean } {
    return { autoSongId: this.on };
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

  private nameSong(song: TranscriptLine[], why: 'auto' | 'retry'): Promise<void> {
    this.waitMs = undefined;
    this.unsure = false;
    this.why = why;
    return this.run(song);
  }

  /** Why it's asking now, for the log. */
  private why: 'auto' | 'retry' = 'auto';

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
  protected async ask(song: TranscriptLine[], prompt: string): Promise<SongAnswer | null> {
    return (await this.options.songId.name({ prompt }, { why: this.why, lines: song })).answer;
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
      this.unsure = true;
      log.info('auto song id found nothing sure', { title: answer?.title });
      return;
    }
    const last = songId.namedAt(answer.title);
    const messages = plainMessages(answer.message, room.replyLimits(maxLength));
    if (!messages.length || (last !== undefined && room.now() - last < repeatMs)) {
      // Still the song it named: she may move on soon, so it looks again sooner.
      this.waitMs = sameAgainMs;
      log.info('auto song id: still the song told lately', { title: answer.title });
      return;
    }
    for (const text of messages) outbox.push({ kind: 'talk', text });
    songId.told(answer);
  }

  protected failed(_song: TranscriptLine[], err: unknown): void {
    this.options.log.warn('auto song id failed', { error: errorMessage(err) });
  }
}
