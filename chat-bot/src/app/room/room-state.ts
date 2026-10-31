import type { RoomMemory } from '@dy-apps/room-memory';
import type { Alias } from '../../core/viewers/alias';
import type { ChatHistory } from '../../core/chat/chat-history';
import type { RecentGifts } from '../../core/chat/recent-gifts';
import { errorMessage } from '../../core/errors';
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
import { combineSpans, type SongBreakSource, type SongSpan } from '../../core/songs/song-breaks';
import type { BotTalk, Log, Screenshot, SettingsStore } from '../ports';

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
  /** The streamer's user id (room_config.json's `streamer`), read each time; none until known. */
  streamerId?: () => string | undefined;
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
  /** A JPEG of the live video, sent to Claude with a prompt while screenshots are on. */
  screenshot?: Screenshot;
  /**
   * The room's settings: `screenshots` (whether prompts get the live video; /截图 switches it),
   * `maxReplyParts` (the most messages anything the bot says is split into, `@asker (1/3) …`), and
   * all of them for `{{settings}}`.
   */
  settings: SettingsStore;
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
  /** The bot's own user id, to find its own chat lines (and what it wears) by; its nickname without it. */
  botId?: string;
  /**
   * The song break sources the room has on, by name (room_config.json's `songBreaks`), read each
   * time; undefined for all of them.
   */
  songBreaks?: () => readonly string[] | undefined;
  /**
   * Where songs start beyond pauses and talk (see song-breaks.ts), highest ranked first (see
   * combineSpans), asked on use: the sources may be made after the room, so it doesn't hold them.
   */
  songBreakSources?: () => readonly SongBreakSource[];
  /** Words Douyin holds back a message for, with what to write instead, read each time. */
  forbiddenWords?: () => ForbiddenWords;
  /** The rules for topics not to take up, for `{{forbiddenTopics}}`, read each time. */
  forbiddenTopics?: () => string;
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
  /** What the bot's own account wore by its name the last time its own chat was seen. */
  private ownBadgesSeen: OwnBadges | undefined;

  constructor(private readonly options: RoomStateOptions) {
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

  /**
   * What the bot remembers about `userId`, for a prompt answering them: their note.md. Empty for
   * the streamer, whose note every prompt has already, and for anyone in a 私密 room, whose
   * viewers can't be told apart.
   */
  askerNote(userId: string | undefined): string {
    const { memory, streamerId, isPrivate } = this.options;
    if (!memory || !userId || userId === streamerId?.() || isPrivate?.()) return '';
    return memory.noteText(userId);
  }

  /** How what the bot says is fit into messages of at most `maxLength` characters, as set now. */
  replyLimits(maxLength: number): ReplyLimits {
    return {
      maxLength,
      maxParts: this.options.settings.get().maxReplyParts,
      atTrimStart: this.atTrimStart(),
      forbidden: this.options.forbiddenWords?.(),
    };
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

  /**
   * What the song break sources the room has on make of `lines`, combined (see combineSpans), for
   * currentSong and singingSong; none without any.
   */
  songSpans(lines: readonly TranscriptLine[]): SongSpan[] {
    const on = this.options.songBreaks?.();
    return combineSpans(
      (this.options.songBreakSources?.() ?? [])
        .filter((source) => !on || on.includes(source.name))
        .map((source) => source.spans(lines)),
    );
  }

  /** What the bot said in the room lately, one message a line; empty when it said nothing. */
  botTalk(): string {
    return this.options.botTalk?.recent() ?? '';
  }

  /** The room's part of a prompt (see buildPrompt), as it is now. */
  promptInput(): RoomPromptInput {
    const { chatDir, memory, intro, limitations, botTalk } = this.options;
    const streamerId = this.options.streamerId?.();
    return {
      wording: this.wording,
      aliases: this.aliases(),
      history: this.recentChat(),
      gifts: this.options.gifts?.recent(this.now()),
      transcript: this.recentTranscript(),
      now: this.now(),
      timeZone: this.timeZone(),
      chatDir,
      memoryDir: memory?.readDir(),
      persona: this.persona,
      botName: this.botName,
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
    const { botId } = this.options;
    const own = [...this.recentChat()]
      .reverse()
      .find((line) => (botId ? line.userId === botId : line.nickname === this.botName));
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

  /**
   * The live video while screenshots are on, or `always`; nothing while they're off (without
   * asking room-feed) or when there's no screenshot to be had: prompting goes on.
   */
  async screenshot(always = false): Promise<Uint8Array | undefined> {
    if (!this.options.settings.get().screenshots && !always) return undefined;
    try {
      return await this.options.screenshot?.();
    } catch (err) {
      this.options.log.warn('no screenshot', { error: errorMessage(err) });
      return undefined;
    }
  }
}
