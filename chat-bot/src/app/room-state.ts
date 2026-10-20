import type { ChatHistory } from '../core/chat-history';
import type { RecentGifts } from '../core/recent-gifts';
import { errorMessage } from '../core/errors';
import type { Wording } from '../core/wording';
import {
  buildPrompt,
  type PromptDetails,
  type RoomPromptInput,
  type RoomSettings,
} from '../core/prompt';
import type { ChatLine } from '../core/room-events';
import {
  DEFAULT_TRANSCRIPT_WINDOW_MS,
  type Transcript,
  type TranscriptLine,
} from '../core/transcript';
import { done, failed, type Command } from './command';
import type { BotTalk, Log, Screenshot, SettingsStore } from './ports';
import { setting } from './setting';

/** What a feature adds to the room's settings (everything but screenshots, which the room keeps). */
export type SettingsPart = Omit<RoomSettings, 'screenshots'>;

export interface RoomStateOptions {
  /** The room's recent chat; whoever hears the chat adds to it. */
  history: ChatHistory;
  /** The gifts of the last few minutes, shown among the chat in every prompt. */
  gifts?: RecentGifts;
  /** What the streamer has said, for `{{transcript}}`. */
  transcript?: Transcript;
  /** How far back `{{transcript}}` goes. */
  transcriptMs?: number;
  /** Who the bot plays, for `{{persona}}`, read each time so edits apply at once. */
  persona?: () => string;
  /** Keeps a persona /修改人设 set, so the next `persona()` reads it, and so does the next run. */
  savePersona?: (persona: string) => void;
  /** Background on the room for `{{context}}`, read each time so edits apply at once. */
  context?: () => string;
  /** What the bot says about itself for `{{intro}}`, read each time so edits apply at once. */
  intro?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /** A JPEG of the live video, sent to Claude with a prompt while screenshots are on. */
  screenshot?: Screenshot;
  /** Whether to start with screenshots on (when there's a `screenshot`); /截图 switches it. Without `settings`, what it starts as. */
  screenshotsOn?: boolean;
  /** The room's settings, where that is kept (`screenshots`). */
  settings?: SettingsStore;
  /** The folder of the room's chat record files, for `{{chatDir}}`. */
  chatDir?: string;
  /** The sentences prompts say around what they fill in (wording.md), read each time. */
  wording: Wording;
  /** Other names the bot is called in this room (room_config.json's `aliases`), read each time. */
  aliases?: () => readonly string[];
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
  botName: string;
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
  readonly botName: string;
  readonly wording: Wording;
  private readonly clock: () => number;
  private readonly screenshotsSetting: ReturnType<typeof setting<'screenshots'>>;
  /** The persona, without a `persona` to read it from. */
  private ownPersona = '';
  /** The parts of the room's settings the features keep, for `{{settings}}`. */
  private readonly settingsParts: (() => SettingsPart)[] = [];

  constructor(private readonly options: RoomStateOptions) {
    this.screenshotsSetting = setting(
      options.settings,
      'screenshots',
      options.screenshotsOn ?? true,
    );
    this.botName = options.botName;
    this.wording = options.wording;
    this.clock = options.now ?? Date.now;
  }

  /** Who the bot plays; admins change it while the bot runs. */
  get persona(): string {
    const { persona } = this.options;
    return persona ? persona().trim() : this.ownPersona;
  }

  set persona(persona: string) {
    this.ownPersona = persona;
    this.options.savePersona?.(persona);
  }

  now(): number {
    return this.clock();
  }

  /** Other names the bot is called in this room, which mean it too. */
  aliases(): readonly string[] {
    return this.options.aliases?.() ?? [];
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

  /** What the bot said in the room lately, one message a line; empty when it said nothing. */
  botTalk(): string {
    return this.options.botTalk?.recent() ?? '';
  }

  /**
   * Has `part`, read each time, in `{{settings}}`: a feature gives what it keeps there (how much an
   * @ costs, say), which admins may change while the bot runs. Without any, there's no settings
   * text at all.
   */
  addSettings(part: () => SettingsPart): void {
    this.settingsParts.push(part);
  }

  /** The room's part of a prompt (see buildPrompt), as it is now. */
  promptInput(): RoomPromptInput {
    const { chatDir, context, intro, botTalk, commands } = this.options;
    return {
      wording: this.wording,
      aliases: this.aliases(),
      history: this.recentChat(),
      gifts: this.options.gifts?.recent(this.now()),
      transcript: this.recentTranscript(),
      now: this.now(),
      chatDir,
      persona: this.persona,
      botName: this.botName,
      context: context?.(),
      intro: intro?.(),
      botTalk: botTalk?.recent(),
      settings: this.settings(),
      commands: commands?.(),
    };
  }

  /**
   * Fills the prompt `template` (see buildPrompt) with the room as it is now and `details`, what's
   * particular to this prompt; `details` may also replace a part of the room's (a shorter chat, say).
   */
  prompt(template: string, details: PromptDetails & Partial<RoomPromptInput>): string {
    return buildPrompt(template, { ...this.promptInput(), ...details });
  }

  private settings(): RoomSettings | undefined {
    if (!this.settingsParts.length) return undefined;
    return Object.assign({}, ...this.settingsParts.map((part) => part()), {
      screenshots: this.screenshots,
    }) as RoomSettings;
  }

  /** Whether prompts get the live video; admins switch it while the bot runs. */
  get screenshots(): boolean {
    return this.screenshotsSetting.get();
  }

  set screenshots(on: boolean) {
    if (on === this.screenshots) return;
    this.screenshotsSetting.set(on);
    this.options.log.info('screenshot', { enabled: on });
  }

  /**
   * The live video while screenshots are on, or `always`; nothing while they're off (without
   * asking DyHub) or when there's no screenshot to be had: prompting goes on.
   */
  async screenshot(always = false): Promise<Uint8Array | undefined> {
    if (!this.screenshots && !always) return undefined;
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}

/** `/修改人设 …`: changes who the bot plays (in the room's persona.md, so it stays). */
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
