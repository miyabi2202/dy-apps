import { clock, localDate, machineTimeZone, retimeLines, timeZoneName } from './local-time';
import type { GiftLine } from '../chat/recent-gifts';
import type { ChatLine } from '../chat/room-events';
import { fillTemplate } from './template';
import { settingsText, type Settings } from '../commands/settings';
import type { Wording } from './wording';
import { isGuest, isPlayed, isSung, type TranscriptLine } from '../songs/transcript';

/** What every prompt knows about the room as it is now. */
export interface RoomPromptInput {
  /** The sentences the prompt says around what it fills in (wording.md). */
  wording: Wording;
  /** Recent chat before the question, oldest first. */
  history: readonly ChatLine[];
  /** The gifts of the last few minutes, oldest first, which `{{history}}` shows among the chat. */
  gifts?: readonly GiftLine[];
  /** What the streamer said lately, oldest first. */
  transcript: readonly TranscriptLine[];
  /** The current time, ms since the epoch. */
  now: number;
  /** The time zone every time in the prompt is in (the streamer's; the machine's when unset). */
  timeZone?: string;
  /** The folder of the room's chat record files. */
  chatDir?: string;
  /** The folder of what the bot remembered before and changed since (the archive). */
  memoryDir?: string;
  /** Who the bot plays, as admins set it. */
  persona?: string;
  /** The bot's own nickname, to spot its own messages in the chat. */
  botName?: string;
  /** Other names the bot is called in this room, which mean it too. */
  aliases?: readonly string[];
  /** What the bot remembers about the room (memory.md): who the streamer is, running jokes, what to mind. */
  memory?: string;
  /** What the bot remembers about the streamer (their note.md), in every prompt since viewers ask about them. */
  streamerNote?: string;
  /** The bot's own latest thoughts after the room's streams (memory/thoughts.md), one a line. */
  thoughts?: string;
  /** What every room's viewers ask about Douyin itself (灯牌, …), from the knowledge base (data/knowledge/douyin/, see KnowledgeRecall). */
  commonKnowledge?: string;
  /** What the bot says about itself when asked: who made it, what it can and can't do. */
  intro?: string;
  /** What the bot can't do and why, to explain when viewers notice. */
  limitations?: string;
  /** What the bot itself said in the room lately, one message a line. */
  botTalk?: string;
  /** How the bot is set up in the room right now. */
  settings?: Settings;
  /** What the bot's own account wears by its name, from its own latest chat line. */
  ownBadges?: OwnBadges;
  /** The rules for topics the bot must not take up (forbidden.md's `## Topics`). */
  forbiddenTopics?: string;
}

/** What the bot's own account wears by its name, as room-feed sends it with its own chat. */
export interface OwnBadges {
  /** Its level in the streamer's fan club (the 灯牌 by its name). */
  fansLevel?: number;
  /** Its wealth level (财富). */
  payLevel?: number;
}

/** `badges` as a line for the prompt, after the settings: empty when there are none. */
function ownBadgesText({ fansLevel, payLevel }: OwnBadges): string {
  const worn = [
    ...(fansLevel ? [`主播的粉丝团灯牌 ${fansLevel} 级`] : []),
    ...(payLevel ? [`财富等级 ${payLevel} 级`] : []),
  ];
  return worn.length
    ? `你自己这个账号名字旁边挂着：${worn.join('、')}（大家都看得见，随送礼和互动会涨）。`
    : '';
}

/** Where the bot heard someone talk to or about it without an @: the chat, or (the streamer) the stream. */
export type Heard = 'chat' | 'speech';

/** What's particular to one prompt: who asked what, and how long the answer may be. */
export interface PromptDetails {
  /** Who the prompt is about; empty for what the bot says on its own. */
  asker?: string;
  question?: string;
  /** How many characters fit in one message. */
  singleLength: number;
  /** How many characters the answer may use at most, over several messages. */
  maxLength: number;
  /** The asker's past exchanges with the bot. */
  userHistory?: string;
  /** What the bot remembers about the asker (their note.md); none for the streamer, whose note `memory` has. */
  askerNote?: string;
  /** The asker's own recent messages in the chat, one a line. */
  userChat?: string;
  /** The badges shown by the asker's name (a 直播间会员's `V` or `V年`), when known. */
  askerBadges?: readonly string[];
  /** The asker didn't @ the bot: the bot heard them say something to or about it, in the chat or
   * (the streamer) on the stream, and answers unprompted. */
  unprompted?: Heard;
  /** The tools whose listen the line matched, named to the model as a hint (see `{{asked}}`). */
  topics?: readonly string[];
  /** What the asker said before `question` while they waited, oldest first: one request with it. */
  earlier?: readonly string[];
}

/** The room plus what's particular to one prompt. */
export type PromptInput = RoomPromptInput & PromptDetails;

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat (and, among them
 * by time, `昵称: （送出 玫瑰×1，1钻）` per recent gift), `{{transcript}}`
 * one `HH:MM:SS 内容` line per sentence the streamer said (`HH:MM:SS （唱）内容` when sung, and
 * `（连线）` before it when someone they're linked up with said it), `{{asker}}` and `{{question}}` the
 * mention's sender and text, `{{asked}}` the two as a line saying they @ed the bot (or, when
 * `unprompted`, that it heard them talk to or about it, and, for a line that matched a tool's listen, a line naming the tool as a hint; after what they said `earlier` while they waited, as one request), `{{singleLength}}` what fits in one message and `{{maxLength}}` the
 * most the answer may use over several, `{{now}}` the time, `{{today}}` the date and weekday
 * (`2026-10-20 星期二`), both in the room's time zone, `{{timeZone}}` that zone's name (北京时间), `{{recordTimeZone}}` the machine's
 * (which record lines written before, without an offset, are in), `{{chatDir}}` the folder of chat
 * record files, `{{memoryDir}}` the folder of its older memories, `{{persona}}` the line `你的人设是…` (empty without a persona), `{{aliases}}` a line saying the room's other names for the bot mean it too (empty without any), `{{botName}}`
 * the bot's own nickname, `{{memory}}` what the bot remembers about the room and about the
 * streamer and its own thoughts after the last streams, each under a heading (empty without any), `{{askerNote}}` what it remembers about
 * the asker, likewise, `{{commonKnowledge}}` Douyin's own common knowledge (灯牌…), likewise, `{{intro}}`
 * what the bot says about itself, likewise, `{{limitations}}` what it can't do and why, likewise, `{{botTalk}}` what the bot said lately, `{{userHistory}}` the asker's past
 * exchanges with it and `{{userChat}}` their own recent messages (each `（暂无）` when there's
 * none), `{{askerBadges}}` the badges by their name (`V年`; `（无）` when none or not known), `{{settings}}` the room's settings as a list
 * (empty when not given), and `{{forbiddenTopics}}` the rules for topics not to take up, as they are.
 */
export function buildPrompt(template: string, input: PromptInput): string {
  const { history, transcript, singleLength, maxLength, now, chatDir, persona } = input;
  const { asker = '', question = '', botName, botTalk, userHistory, userChat } = input;
  const { settings, unprompted, topics, earlier, intro, wording } = input;
  const said = question || wording('asked-nothing');
  const values: Record<string, string> = {
    history: historyText(history, input.gifts ?? []),
    transcript:
      transcript
        .map((line) => {
          const marks = isPlayed(line)
            ? '（放歌）'
            : `${isGuest(line) ? '（连线）' : ''}${isSung(line) ? '（唱）' : ''}`;
          return `${clock(line.start, input.timeZone)} ${marks}${line.text}`;
        })
        .join('\n') || '（暂无）',
    asker,
    question: said,
    asked:
      (earlier?.length
        ? `${wording('asked-earlier', { asker, lines: earlier.map((line) => `- ${line}`).join('\n') })}\n`
        : '') +
      wording(
        unprompted === 'speech'
          ? 'asked-speech'
          : unprompted === 'chat'
            ? 'asked-chat'
            : 'asked-mention',
        { asker, said },
      ) +
      (topics?.length ? `\n${wording('asked-topics', { tools: topics.join('、') })}` : ''),
    singleLength: String(singleLength),
    maxLength: String(maxLength),
    now: clock(now, input.timeZone),
    today: localDate(now, input.timeZone),
    timeZone: timeZoneName(input.timeZone),
    recordTimeZone: machineTimeZone(),
    chatDir: chatDir ?? '（无）',
    persona: persona ? `你的人设是${persona}` : '',
    aliases: input.aliases?.length
      ? `\n${wording('aliases-you', { names: input.aliases.join('、') })}`
      : '',
    botName: botName ?? '',
    memory: [
      input.memory?.trim()
        ? wording('memory', { memory: input.memory.trim(), memoryDir: input.memoryDir ?? '（无）' })
        : '',
      input.streamerNote?.trim()
        ? wording('streamer-note', { note: input.streamerNote.trim() })
        : '',
      input.thoughts?.trim() ? wording('thoughts', { thoughts: input.thoughts.trim() }) : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    askerNote: input.askerNote?.trim()
      ? wording('asker-note', { asker, note: input.askerNote.trim() })
      : '',
    commonKnowledge: input.commonKnowledge?.trim()
      ? wording('common-knowledge', { knowledge: input.commonKnowledge.trim() })
      : '',
    intro: intro?.trim() ? wording('intro', { intro: intro.trim() }) : '',
    limitations: input.limitations?.trim()
      ? wording('limitations', { limitations: input.limitations.trim() })
      : '',
    // In the room's time; lines written before (no offset) had the machine's, shown in the room's.
    botTalk: retimeLines(botTalk?.trim() ?? '', input.timeZone) || '（暂无）',
    userHistory: retimeLines(userHistory?.trim() ?? '', input.timeZone) || '（暂无）',
    userChat: userChat?.trim() || '（暂无）',
    askerBadges: input.askerBadges?.length ? input.askerBadges.join('、') : '（无）',
    settings: [settings ? settingsText(settings) : '', ownBadgesText(input.ownBadges ?? {})]
      .filter(Boolean)
      .join('\n'),
    forbiddenTopics: input.forbiddenTopics?.trim() ?? '',
  };
  return fillTemplate(template, values);
}

/** `history` as `昵称: 内容` lines, and `gifts` among them by time as `昵称: （送出 玫瑰×1，1钻）`. */
function historyText(history: readonly ChatLine[], gifts: readonly GiftLine[]): string {
  const lines = [
    ...history.map((line) => ({ ts: line.ts, text: `${line.nickname}: ${line.content}` })),
    ...gifts.map((g) => ({
      ts: g.ts,
      text: `${g.nickname}: （送出 ${g.name}×${g.count}，${g.diamonds}钻）`,
    })),
  ].sort((a, b) => a.ts - b.ts);
  return lines.map((line) => line.text).join('\n') || '（暂无）';
}
