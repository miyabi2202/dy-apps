import type { ChatHistory } from '../core/chat-history';
import { errorMessage } from '../core/errors';
import type { RoomPromptInput } from '../core/prompt';
import type { ChatLine } from '../core/room-events';
import {
  DEFAULT_TRANSCRIPT_WINDOW_MS,
  type Transcript,
  type TranscriptLine,
} from '../core/transcript';
import type { BotTalk, Log, Screenshot } from './ports';

export interface RoomStateOptions {
  /** The room's recent chat; whoever hears the chat adds to it. */
  history: ChatHistory;
  /** What the streamer has said, for `{{transcript}}`. */
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  /** Who the bot plays to start with, for `{{persona}}`. */
  persona?: string;
  /** Background on the room for `{{context}}`, read each time so edits apply at once. */
  context?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /** A JPEG of the live video, sent to Claude with a prompt. */
  screenshot?: Screenshot;
  /** The folder of the room's chat record files, for `{{chatDir}}`. */
  chatDir?: string;
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
  botName: string;
  log: Log;
  now?: () => number;
}

/**
 * What the room looks like right now, in one place: the chat, what the streamer said, who the
 * bot plays, the room's background and what the bot said lately. Everything that prompts Claude
 * (answering a mention, talking unprompted, thanking a giver) asks it for the part of every
 * prompt they have in common, so none of them wires these up on its own.
 */
export class RoomState {
  /** Who the bot plays; admins change it while the bot runs. */
  persona: string;
  readonly botName: string;
  private readonly clock: () => number;

  constructor(private readonly options: RoomStateOptions) {
    this.persona = options.persona ?? '';
    this.botName = options.botName;
    this.clock = options.now ?? Date.now;
  }

  now(): number {
    return this.clock();
  }

  /** The room's recent chat, oldest first. */
  recentChat(): ChatLine[] {
    return this.options.history.recent();
  }

  /** What the streamer said lately, oldest first. */
  recentTranscript(): TranscriptLine[] {
    const { transcript, transcriptMs = DEFAULT_TRANSCRIPT_WINDOW_MS } = this.options;
    return transcript?.recent(transcriptMs) ?? [];
  }

  /** The room's part of a prompt (see buildPrompt), as it is now. */
  promptInput(): RoomPromptInput {
    const { chatDir, context, botTalk } = this.options;
    return {
      history: this.recentChat(),
      transcript: this.recentTranscript(),
      now: this.now(),
      chatDir,
      persona: this.persona,
      botName: this.botName,
      context: context?.(),
      botTalk: botTalk?.recent(),
    };
  }

  /** The live video, or nothing when there's no screenshot to be had: prompting goes on. */
  async screenshot(): Promise<Uint8Array | undefined> {
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}
