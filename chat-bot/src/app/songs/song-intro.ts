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

/** The song named. */
type Song = Pick<SongAnswer, 'title' | 'artist'>;

/** At most this many of Claude's turns, searching for the song. */
const MAX_TURNS = 8;

/**
 * After a song was named (by /识歌 or on its own), lets Claude say up to two more messages to the
 * room, whatever it likes (something it finds searching for the song, a word on how the streamer
 * sang it, a joke) or nothing, so it doesn't fall into one pattern song after song.
 */
export class SongIntro extends ModelFeature<Song, SongIntroAnswer> {
  constructor(private readonly options: SongIntroOptions) {
    super(options.log);
  }

  introduce(song: Song): Promise<void> {
    return song.title ? this.run(song) : Promise.resolve();
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
    return room.prompt(template, {
      transcript: currentSong(room.recentTranscript().filter((line) => !isGuestTalk(line))),
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
    return value ?? undefined;
  }

  protected deliver({ title }: Song, answer: SongIntroAnswer): void {
    const { outbox, log, room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    log.info('song intro', { title, hook: this.hook, messages: answer.messages });
    for (const message of answer.messages) {
      for (const text of plainMessages(message, room.replyLimits(maxLength))) {
        outbox.push({ kind: 'talk', text });
      }
    }
  }

  protected failed({ title }: Song, err: unknown): void {
    this.options.log.warn('could not introduce the song', { title, error: errorMessage(err) });
  }
}
