import { errorMessage } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import type { SongAnswer } from '../core/song-answer';
import { parseSongIntro, SONG_INTRO_SCHEMA } from '../core/song-intro-answer';
import { currentSong, isGuest } from '../core/transcript';
import type { Outbox } from './outbox';
import type { AskClaude, Log } from './ports';
import type { RoomState } from './room-state';

export interface SongIntroOptions {
  /** Claude, with web search and fetch. */
  ask: AskClaude;
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
 * After a song was named (by /识歌 or on its own), says two more messages to the room: one about
 * the song, from what Claude finds searching for it, then one praising the streamer's singing,
 * from what they sang. One prompt writes both, so they don't repeat each other.
 */
export class SongIntro {
  constructor(private readonly options: SongIntroOptions) {}

  async introduce({ title, artist }: Pick<SongAnswer, 'title' | 'artist'>): Promise<void> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    if (!title) return;
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        ...room.promptInput(),
        transcript: currentSong(room.recentTranscript().filter((line) => !isGuest(line))),
        question: artist ? `《${title}》，原唱 ${artist}` : `《${title}》`,
        singleLength: maxLength,
        maxLength,
      });
      const text = await ask({
        prompt,
        tools: ['WebSearch', 'WebFetch'],
        maxTurns: MAX_TURNS,
        schema: SONG_INTRO_SCHEMA,
      });
      const answer = parseSongIntro(text);
      if (!answer) {
        log.warn('song intro answer is not json', { text });
        return;
      }
      log.info('song intro', { title, ...answer });
      for (const message of [answer.intro, answer.praise]) {
        const said = plainMessage(message, maxLength);
        if (said) outbox.push({ kind: 'talk', text: said });
      }
    } catch (err) {
      log.warn('could not introduce the song', { title, error: errorMessage(err) });
    }
  }
}
