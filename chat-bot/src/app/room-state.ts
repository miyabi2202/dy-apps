import type { ChatHistory } from '../core/chat-history';
import { errorMessage } from '../core/errors';
import type { RoomPromptInput, RoomSettings } from '../core/prompt';
import type { ChatLine } from '../core/room-events';
import {
  DEFAULT_TRANSCRIPT_WINDOW_MS,
  type Transcript,
  type TranscriptLine,
} from '../core/transcript';
import { done, failed, type Command } from './command';
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
  /** A JPEG of the live video, sent to Claude with a prompt while screenshots are on. */
  screenshot?: Screenshot;
  /** Whether to start with screenshots on (when there's a `screenshot`); /截图 switches it. */
  screenshotsOn?: boolean;
  /** The folder of the room's chat record files, for `{{chatDir}}`. */
  chatDir?: string;
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
  botName: string;
  /** The rest of the room's settings, kept by the features they belong to, for `{{settings}}`. */
  settings?: () => Omit<RoomSettings, 'screenshots'>;
  /** The commands viewers can run, for `{{commands}}`, read each time so edits apply at once. */
  commands?: () => string;
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
  private screenshotsOn: boolean;

  constructor(private readonly options: RoomStateOptions) {
    this.persona = options.persona ?? '';
    this.screenshotsOn = options.screenshotsOn ?? true;
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
    const { chatDir, context, botTalk, settings, commands } = this.options;
    return {
      history: this.recentChat(),
      transcript: this.recentTranscript(),
      now: this.now(),
      chatDir,
      persona: this.persona,
      botName: this.botName,
      context: context?.(),
      botTalk: botTalk?.recent(),
      settings: settings && { ...settings(), screenshots: this.screenshotsOn },
      commands: commands?.(),
    };
  }

  /** Whether prompts get the live video; admins switch it while the bot runs. */
  get screenshots(): boolean {
    return this.screenshotsOn;
  }

  set screenshots(on: boolean) {
    if (on === this.screenshotsOn) return;
    this.screenshotsOn = on;
    this.options.log.info('screenshot', { enabled: on });
  }

  /**
   * The live video, or nothing while screenshots are off (without asking DyHub) or when there's
   * no screenshot to be had: prompting goes on.
   */
  async screenshot(): Promise<Uint8Array | undefined> {
    if (!this.screenshotsOn) return undefined;
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}

/** `/修改人设 …`: changes who the bot plays, until it stops. */
export function personaCommand(room: Pick<RoomState, 'persona'>): Command {
  return {
    name: '修改人设',
    adminOnly: true,
    price: 0,
    run(args) {
      if (!args) return failed('人设不能为空，用法：/修改人设 人设');
      room.persona = args;
      return done('已处理修改人设请求');
    },
  };
}

/** `/截图 1` or `/截图 0`: turns screenshots on or off, until the bot stops. */
export function screenshotCommand(room: Pick<RoomState, 'screenshots'>): Command {
  return {
    name: '截图',
    adminOnly: true,
    price: 0,
    run(args) {
      if (args !== '0' && args !== '1') return failed('要写 0（关闭）或 1（打开），用法：/截图 1');
      room.screenshots = args === '1';
      return done('已处理截图请求');
    },
  };
}
