import type { RoomMemory } from '@dy-apps/room-memory';
import type { ChatHistory } from '../../core/chat/chat-history';
import type { RecentGifts } from '../../core/chat/recent-gifts';
import type { Wording } from '../../core/prompts/wording';
import {
  buildPrompt,
  type OwnBadges,
  type PromptDetails,
  type RoomPromptInput,
} from '../../core/prompts/prompt';
import type { ForbiddenWords } from '../../core/prompts/forbidden';
import type { ReplyLimits } from '../../core/replies/reply';
import type { ChatLine } from '../../core/chat/room-events';
import {
  DEFAULT_TRANSCRIPT_WINDOW_MS,
  type Transcript,
  type TranscriptLine,
} from '../../core/songs/transcript';
import type { BotTalk, SettingsStore } from '../ports';
import type { BotNames } from './bot-names';
import type { Streamer } from '../commands/streamer-admin';

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
  /**
   * What the bot remembers (memory.md and each person's note.md), read each time so edits apply at
   * once: the room's and the streamer's for `{{memory}}`, the asker's for `{{askerNote}}`.
   */
  memory?: Pick<RoomMemory, 'roomText' | 'noteText' | 'readDir'>;
  /** Who the streamer is, for their note and for leaving the asker's own out. */
  streamer?: Pick<Streamer, 'id'>;
  /** Whether the room is 私密 (room_config.json's `private`): viewers' notes are left out there. */
  isPrivate?: () => boolean;
  /** Douyin's common knowledge for `{{commonKnowledge}}`, shared by every room, read each time. */
  commonKnowledge?: () => string;
  /** What the bot says about itself for `{{intro}}`, read each time so edits apply at once. */
  intro?: () => string;
  /** What the bot can't do and why, for `{{limitations}}`, read each time. */
  limitations?: () => string;
  /** What the bot has said in the room, for `{{botTalk}}`. */
  botTalk?: Pick<BotTalk, 'recent'>;
  /**
   * The room's settings: `maxReplyParts` (the most messages anything the bot says is split into,
   * `@asker (1/3) …`), and all of them for `{{settings}}`.
   */
  settings: SettingsStore;
  /** The folder of the room's chat record files, for `{{chatDir}}`. */
  chatDir?: string;
  /** The sentences prompts say around what they fill in (wording.md), read each time. */
  wording: Wording;
  /** What the bot is called here, the room's way of writing names, and its time zone. */
  names: BotNames;
  /** Words Douyin holds back a message for, with what to write instead, read each time. */
  forbiddenWords?: () => ForbiddenWords;
  /** The rules for topics not to take up, for `{{forbiddenTopics}}`, read each time. */
  forbiddenTopics?: () => string;
  now?: () => number;
}

/**
 * What the room looks like right now, in one place: the chat, what the streamer said, who the
 * bot plays, the room's background and what the bot said lately. Everything that prompts Claude
 * (answering a mention, talking unprompted, thanking a giver) asks it for the part of every
 * prompt they have in common, so none of them wires these up on its own.
 */
export class RoomState {
  readonly wording: Wording;
  private readonly clock: () => number;
  /** What the bot's own account wore by its name the last time its own chat was seen. */
  private ownBadgesSeen: OwnBadges | undefined;

  constructor(private readonly options: RoomStateOptions) {
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

  /**
   * What the bot remembers about `userId`, for a prompt answering them: their note.md. Empty for
   * the streamer, whose note every prompt has already, and for anyone in a 私密 room, whose
   * viewers can't be told apart.
   */
  askerNote(userId: string | undefined): string {
    const { memory, streamer, isPrivate } = this.options;
    if (!memory || !userId || userId === streamer?.id() || isPrivate?.()) return '';
    return memory.noteText(userId);
  }

  /** How what the bot says is fit into messages of at most `maxLength` characters, as set now. */
  replyLimits(maxLength: number): ReplyLimits {
    return {
      maxLength,
      maxParts: this.options.settings.get().maxReplyParts,
      atTrimStart: this.options.names.atTrimStart(),
      forbidden: this.options.forbiddenWords?.(),
    };
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

  /** The room's part of a prompt (see buildPrompt), as it is now. */
  promptInput(): RoomPromptInput {
    const { chatDir, memory, intro, limitations, botTalk } = this.options;
    const { names } = this.options;
    const streamerId = this.options.streamer?.id();
    return {
      wording: this.wording,
      aliases: names.aliases(),
      history: this.recentChat(),
      gifts: this.options.gifts?.recent(this.now()),
      transcript: this.recentTranscript(),
      now: this.now(),
      timeZone: names.timeZone(),
      chatDir,
      memoryDir: memory?.readDir(),
      persona: this.persona,
      botName: names.botName,
      memory: memory?.roomText(),
      streamerNote: streamerId ? memory?.noteText(streamerId) : undefined,
      commonKnowledge: this.options.commonKnowledge?.(),
      intro: intro?.(),
      limitations: limitations?.(),
      botTalk: botTalk?.recent(),
      settings: this.options.settings.get(),
      ownBadges: this.ownBadges(),
      forbiddenTopics: this.options.forbiddenTopics?.(),
    };
  }

  /**
   * What the bot's own account wears by its name (its 灯牌 and wealth level), from its latest
   * chat line still in the history; once that has scrolled out, what it wore when last seen.
   */
  private ownBadges(): OwnBadges | undefined {
    const { botId, botName } = this.options.names;
    const own = [...this.recentChat()]
      .reverse()
      .find((line) => (botId ? line.userId === botId : line.nickname === botName));
    if (own) {
      this.ownBadgesSeen = {
        ...(own.fansClub?.level && { fansLevel: own.fansClub.level }),
        ...(own.payLevel && { payLevel: own.payLevel }),
      };
    }
    return this.ownBadgesSeen;
  }

  /**
   * Fills the prompt `template` (see buildPrompt) with the room as it is now and `details`, what's
   * particular to this prompt; `details` may also replace a part of the room's (a shorter chat, say).
   */
  prompt(template: string, details: PromptDetails & Partial<RoomPromptInput>): string {
    return buildPrompt(template, { ...this.promptInput(), ...details });
  }
}
