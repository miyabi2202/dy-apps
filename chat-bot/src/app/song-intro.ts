import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import type { SongAnswer } from '../core/song-answer';
import { parseSongIntro, SONG_INTRO_SCHEMA, type SongIntroAnswer } from '../core/song-intro-answer';
import { currentSong, isGuest } from '../core/transcript';
import { askJson } from './ask-json';
import { ModelFeature } from './model-feature';
import type { Outbox } from './outbox';
import type { AskModel, Log } from './ports';
import type { RoomState } from './room-state';

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

  protected buildPrompt({ title, artist }: Song): string {
    const { room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    return room.prompt(this.options.promptTemplate(), {
      transcript: currentSong(room.recentTranscript().filter((line) => !isGuest(line))),
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
    const { outbox, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    log.info('song intro', { title, messages: answer.messages });
    for (const message of answer.messages) {
      const said = plainMessage(message, maxLength);
      if (said) outbox.push({ kind: 'talk', text: said });
    }
  }

  protected failed({ title }: Song, err: unknown): void {
    this.options.log.warn('could not introduce the song', { title, error: errorMessage(err) });
  }
}
