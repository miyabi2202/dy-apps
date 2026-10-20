import { errorMessage } from '../core/errors';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import type { SongAnswer } from '../core/song-answer';
import { parseSongIntro, SONG_INTRO_SCHEMA } from '../core/song-intro-answer';
import { currentSong, isGuest } from '../core/transcript';
import { askJson } from './ask-json';
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

/** At most this many of Claude's turns, searching for the song. */
const MAX_TURNS = 8;

/**
 * After a song was named (by /识歌 or on its own), lets Claude say up to two more messages to the
 * room, whatever it likes (something it finds searching for the song, a word on how the streamer
 * sang it, a joke) or nothing, so it doesn't fall into one pattern song after song.
 */
export class SongIntro {
  constructor(private readonly options: SongIntroOptions) {}

  async introduce({ title, artist }: Pick<SongAnswer, 'title' | 'artist'>): Promise<void> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    if (!title) return;
    try {
      const prompt = room.prompt(this.options.promptTemplate(), {
        transcript: currentSong(room.recentTranscript().filter((line) => !isGuest(line))),
        question: artist ? `《${title}》，原唱 ${artist}` : `《${title}》`,
        singleLength: maxLength,
        maxLength,
      });
      const { value: answer } = await askJson(
        ask,
        { prompt, tools: ['WebSearch', 'WebFetch'], maxTurns: MAX_TURNS },
        {
          schema: SONG_INTRO_SCHEMA,
          parse: parseSongIntro,
          notJson: 'song intro answer is not json',
        },
        log,
      );
      if (!answer) return;
      log.info('song intro', { title, messages: answer.messages });
      for (const message of answer.messages) {
        const said = plainMessage(message, maxLength);
        if (said) outbox.push({ kind: 'talk', text: said });
      }
    } catch (err) {
      log.warn('could not introduce the song', { title, error: errorMessage(err) });
    }
  }
}
