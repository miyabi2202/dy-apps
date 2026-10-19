import { errorMessage } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import { parseTalkAnswer, TALK_ANSWER_SCHEMA } from '../core/talk-answer';
import type { OutgoingMessage, Outbox } from './outbox';
import type { AskClaude, Log } from './ports';
import type { RoomState } from './room-state';

export interface TalkNowOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** The chat, transcript and the rest of what the prompt knows about the room. */
  room: RoomState;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
  /** Called after it says something to the room. */
  onSaid?: () => void;
}

/** Why it talks when the streamer says the wake word. */
export const WOKEN = '主播说了唤醒词。';

/**
 * Has Claude say something to the streamer now, whatever's going on, as fits what's going on:
 * from what the streamer said and sang and the chat lately, and the video when there's a
 * screenshot. Claude may decide there's no need (TALK_ANSWER_SCHEMA).
 */
export class TalkNow {
  constructor(private readonly options: TalkNowOptions) {}

  /** Says something, sent as `kind`, telling Claude `why`; what it said, or null if nothing. */
  async say(kind: OutgoingMessage['kind'], why: string): Promise<string | null> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        ...room.promptInput(),
        question: why,
        singleLength: maxLength,
        maxLength,
      });
      log.debug('talk prompt', { prompt });
      const image = await room.screenshot();
      // An answer that isn't TALK_ANSWER_SCHEMA's shape is taken as the message.
      const raw = await ask({ prompt, image, schema: TALK_ANSWER_SCHEMA });
      const answer = parseTalkAnswer(raw) ?? { reply: true, message: raw };
      if (!answer.reply) {
        log.info('no need to talk', { why });
        return null;
      }
      const text = plainMessage(answer.message, maxLength);
      if (!text) {
        log.warn('claude had nothing to say');
        return null;
      }
      log.info('talking', { text, kind });
      outbox.push({ kind, text });
      this.options.onSaid?.();
      return text;
    } catch (err) {
      log.error('could not talk', { error: errorMessage(err) });
      return null;
    }
  }
}
