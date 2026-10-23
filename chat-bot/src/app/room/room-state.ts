import type { Alias } from '../../core/viewers/alias';
import type { ChatHistory } from '../../core/chat/chat-history';
import type { RecentGifts } from '../../core/chat/recent-gifts';
import { errorMessage } from '../../core/errors';
import type { Wording } from '../../core/prompts/wording';
import {
  buildPrompt,
  type PromptDetails,
  type RoomPromptInput,
  type RoomSettings,
} from '../../core/prompts/prompt';
import type { ReplyLimits } from '../../core/replies/reply';
import type { ChatLine } from '../../core/chat/room-events';
import {
  DEFAULT_TRANSCRIPT_WINDOW_MS,
  type Transcript,
  type TranscriptLine,
} from '../../core/songs/transcript';
import type { BotTalk, Log, Screenshot, SettingsStore } from '../ports';
import { setting } from '../commands/setting';

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
  /** Background on the room for `{{context}}`, read each time so edits apply at once. */
  context?: () => string;
  /** Douyin's common knowledge for `{{commonKnowledge}}`, shared by every room, read each time. */
  commonKnowledge?: () => string;
  /** What the bot says about itself for `{{intro}}`, read each time so edits apply at once. */
  intro?: () => string;
  /** What the bot can't do and why, for `{{limitations}}`, read each time. */
  limitations?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /** A JPEG of the live video, sent to Claude with a prompt while screenshots are on. */
  screenshot?: Screenshot;
  /** Whether to start with screenshots on (when there's a `screenshot`); /截图 switches it. Without `settings`, what it starts as. */
  screenshotsOn?: boolean;
  /** The most messages anything the bot says is split into, `@asker (1/3) …`. Without `settings`, what it starts as. */
  maxReplyParts?: number;
  /** The room's settings, where those are kept (`screenshots`, `maxReplyParts`). */
  settings?: SettingsStore;
  /** The folder of the room's chat record files, for `{{chatDir}}`. */
  chatDir?: string;
  /** The sentences prompts say around what they fill in (wording.md), read each time. */
  wording: Wording;
  /** Other names the bot is called in this room (room_config.json's `aliases`), read each time. */
  aliases?: () => readonly Alias[];
  /** What to take off the start of a nickname when the bot @s someone (`atTrimStart`), read each time. */
  atTrimStart?: () => readonly string[];
  /** The time zone the room's times are shown in (room_config.json's `timeZone`), read each time. */
  timeZone?: () => string;
  /** The bot's own nickname: its messages in the chat don't count as anyone chatting. */
  botName: string;
  /** Words the bot must never say, for `{{forbiddenWords}}`, read each time. */
  forbiddenWords?: () => readonly string[];
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
  private readonly partsSetting: ReturnType<typeof setting<'maxReplyParts'>>;
  /** The parts of the room's settings the features keep, for `{{settings}}`. */
  private readonly settingsParts: (() => SettingsPart)[] = [];

  constructor(private readonly options: RoomStateOptions) {
    this.screenshotsSetting = setting(
      options.settings,
      'screenshots',
      options.screenshotsOn ?? true,
    );
    this.partsSetting = setting(options.settings, 'maxReplyParts', options.maxReplyParts ?? 5);
    this.botName = options.botName;
    this.wording = options.wording;
    this.clock = options.now ?? Date.now;
  }

  /** Who the bot plays, as the room's files say now. */
  get persona(): string {
    return this.options.persona?.().trim() ?? '';
  }

  now(): number {
    return this.clock();
  }

  /** The time zone the room's times are shown in: the streamer's (the machine's when not given). */
  timeZone(): string | undefined {
    return this.options.timeZone?.();
  }

  /** The room's 单推符号, taken off a nickname when the bot has to shorten its @ (see atName). */
  atTrimStart(): readonly string[] {
    return this.options.atTrimStart?.() ?? [];
  }

  /** The most messages anything the bot says is split into; `/最大回复条数` sets it. */
  get maxReplyParts(): number {
    return this.partsSetting.get();
  }

  set maxReplyParts(parts: number) {
    this.partsSetting.set(parts);
  }

  /** How what the bot says is fit into messages of at most `maxLength` characters, as set now. */
  replyLimits(maxLength: number): ReplyLimits {
    return { maxLength, maxParts: this.maxReplyParts, atTrimStart: this.atTrimStart() };
  }

  /** Other names the bot is called in this room, which mean it too. */
  aliases(): readonly string[] {
    return this.callNames()
      .slice(1)
      .map(({ name }) => name);
  }

  /** Every name the bot is called by here: its nickname first, then the room's aliases. */
  callNames(): readonly Alias[] {
    return [{ name: this.botName, heardAs: [] }, ...(this.options.aliases?.() ?? [])];
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
   * Has `part`, read each time, in `{{settings}}`: a feature gives what it keeps there (the
   * auto-reply threshold, say), which admins may change while the bot runs. Without any, there's
   * no settings text at all.
   */
  addSettings(part: () => SettingsPart): void {
    this.settingsParts.push(part);
  }

  /** The room's part of a prompt (see buildPrompt), as it is now. */
  promptInput(): RoomPromptInput {
    const { chatDir, context, intro, limitations, botTalk } = this.options;
    return {
      wording: this.wording,
      aliases: this.aliases(),
      history: this.recentChat(),
      gifts: this.options.gifts?.recent(this.now()),
      transcript: this.recentTranscript(),
      now: this.now(),
      timeZone: this.timeZone(),
      chatDir,
      persona: this.persona,
      botName: this.botName,
      context: context?.(),
      commonKnowledge: this.options.commonKnowledge?.(),
      intro: intro?.(),
      limitations: limitations?.(),
      botTalk: botTalk?.recent(),
      settings: this.settings(),
      forbiddenWords: this.options.forbiddenWords?.(),
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
   * asking room-feed) or when there's no screenshot to be had: prompting goes on.
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
