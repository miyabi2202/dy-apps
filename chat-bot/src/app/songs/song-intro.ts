import { errorMessage } from '../../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessages } from '../../core/replies/reply';
import type { SongAnswer } from '../../core/songs/song-answer';
import {
  parseSongIntro,
  SONG_INTRO_SCHEMA,
  type SongIntroAnswer,
} from '../../core/songs/song-intro-answer';
import { currentSong, isGuestTalk } from '../../core/songs/transcript';
import { askJson } from '../models/ask-json';
import { ModelFeature } from '../models/model-feature';
import type { Outbox } from '../replies/outbox';
import type { AskModel, Log } from '../ports';
import type { RoomState } from '../room/room-state';

export interface SongIntroOptions {
  /** Claude, with web search and fetch. */
  ask: AskModel;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  room: RoomState;
  log: Log;
  /** Douyin's chat length limit. */
  maxLength?: number;
  /** How often a message also gets a hook, something anyone in the room can answer. */
  hookChance?: number;
  /** 0–1, uniformly; tests pass their own. */
  random?: () => number;
}

/** The song named, with the program's plain sentence for it (`message`), said when Claude's isn't. */
type Song = Pick<SongAnswer, 'message' | 'title' | 'artist' | 'othersSang'>;

/** At most this many of Claude's turns, searching for the song. */
const MAX_TURNS = 8;

/**
 * When a song was named (by /识歌 or on its own), tells the room in one message Claude writes: the
 * song, woven into whatever it likes (something it finds searching for it, the room, a joke), so it
 * doesn't fall into one pattern song after song. The program's plain sentence (「这首是…」) goes
 * out instead when Claude fails or leaves the title out.
 */
export class SongIntro extends ModelFeature<Song, SongIntroAnswer> {
  constructor(private readonly options: SongIntroOptions) {
    super(options.log);
  }

  /**
   * Only the plain sentence for a song another voice sang most of (a 连线, a recording, or the
   * streamer taken for someone else): what Claude would say is about the streamer singing it.
   */
  introduce(song: Song): Promise<void> {
    if (!song.title) return Promise.resolve();
    if (song.othersSang) {
      this.options.log.info('no song intro, others sang', { title: song.title });
      this.say(song.message);
      return Promise.resolve();
    }
    return this.run(song);
  }

  /** Whether the intro being made now was asked for a hook (for the log). */
  private hook = false;

  protected buildPrompt({ title, artist }: Song): string {
    const {
      room,
      maxLength = DOUYIN_CHAT_LIMIT,
      hookChance = 0.25,
      random = Math.random,
    } = this.options;
    // A model can't keep to a rate by itself, so the dice are rolled here: `{{hook}}` says whether
    // this song's message ends with something anyone can answer, or asks nothing.
    this.hook = random() < hookChance;
    const template = this.options
      .promptTemplate()
      .replace('{{hook}}', room.wording(this.hook ? 'song-hook' : 'song-no-hook'));
    const transcript = room.recentTranscript().filter((line) => !isGuestTalk(line));
    return room.prompt(template, {
      transcript: currentSong(transcript, { spans: room.songSpans(transcript) }),
      question: artist ? `《${title}》，原唱 ${artist}` : `《${title}》`,
      singleLength: maxLength,
      maxLength,
    });
  }

  protected async ask(_song: Song, prompt: string): Promise<SongIntroAnswer | undefined> {
    const { value } = await askJson(
      this.options.ask,
      { prompt, tools: ['WebSearch', 'WebFetch'], maxTurns: MAX_TURNS },
      {
        schema: SONG_INTRO_SCHEMA,
        parse: parseSongIntro,
        notJson: 'song intro answer is not json',
      },
      this.options.log,
    );
    // Not json: the plain sentence still names the song.
    return value ?? { message: '' };
  }

  protected deliver(song: Song, { message }: SongIntroAnswer): void {
    const named = message.includes(song.title);
    this.options.log.info('song intro', { title: song.title, hook: this.hook, message, named });
    this.say(named ? message : song.message);
  }

  protected failed(song: Song, err: unknown): void {
    this.options.log.warn('could not introduce the song', {
      title: song.title,
      error: errorMessage(err),
    });
    this.say(song.message);
  }

  private say(message: string): void {
    const { outbox, room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    for (const text of plainMessages(message, room.replyLimits(maxLength))) {
      outbox.push({ kind: 'talk', text });
    }
  }
}
