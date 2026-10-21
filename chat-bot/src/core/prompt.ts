import { clock, localDate, machineTimeZone, retimeLines, timeZoneName } from './local-time';
import type { GiftLine } from './recent-gifts';
import type { ChatLine } from './room-events';
import type { Wording } from './wording';
import { isGuest, isSung, type TranscriptLine } from './transcript';

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
  /** Who the bot plays, as admins set it. */
  persona?: string;
  /** The bot's own nickname, to spot its own messages in the chat. */
  botName?: string;
  /** Other names the bot is called in this room, which mean it too. */
  aliases?: readonly string[];
  /** Background on the room: who the streamer is, what's talked about, what to mind. */
  context?: string;
  /** What the bot says about itself when asked: who made it, what it can and can't do. */
  intro?: string;
  /** What the bot itself said in the room lately, one message a line. */
  botTalk?: string;
  /** How the bot is set up in the room right now. */
  settings?: RoomSettings;
  /** The commands viewers can run, as described for them (commands.md's list). */
  commands?: string;
}

/**
 * How the bot is set up in the room right now, which admins can change while it runs. Each feature
 * gives its own part (see RoomState.addSettings), and the prompt lists the parts there are.
 */
export interface RoomSettings {
  /** Diamonds one @ costs; 0 free. */
  mentionCost?: number;
  /** Whether prompts get a screenshot of the live video. */
  screenshots: boolean;
  /** How likely something must be about the bot for it to reply unprompted; 1 or more never. */
  autoReplyThreshold?: number;
  /** How long it keeps quiet after talking unprompted. */
  autoReplyIntervalMs?: number;
  /** Viewers whose gifts within 5 minutes pass this many diamonds are thanked. */
  thanksThreshold?: number;
  /** Whether the bot names the songs the streamer sings without being asked. */
  autoSongId?: boolean;
}

/** A threshold this high means thanks are off: nobody gives that much in 5 minutes. */
const THANKS_OFF_FROM = 99999;

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
  /** The asker's own recent messages in the chat, one a line. */
  userChat?: string;
  /** The asker's diamonds left to pay for @s with. */
  askerBalance?: number;
  /** The asker didn't @ the bot: the bot heard them say something to or about it, in the chat or
   * (the streamer) on the stream, and answers unprompted. */
  unprompted?: Heard;
}

/** The room plus what's particular to one prompt. */
export type PromptInput = RoomPromptInput & PromptDetails;

/** `settings` as lines for the prompt, with `asker`'s balance when known. */
function settingsText(settings: RoomSettings, asker: string, askerBalance?: number): string {
  const { mentionCost, screenshots, autoReplyThreshold, autoReplyIntervalMs } = settings;
  const { thanksThreshold, autoSongId } = settings;
  const interval =
    autoReplyIntervalMs === undefined ? '' : `，两次之间至少隔 ${autoReplyIntervalMs / 1000} 秒`;
  return [
    '直播间现在的设置（机器人管理员可以用指令修改）：',
    ...(mentionCost === undefined
      ? []
      : [
          `- 每次 @ 你：${mentionCost > 0 ? `${mentionCost} 钻，用观众给主播送过的礼物抵（不会另外扣观众的钱）` : '免费'}`,
        ]),
    `- 截图：${screenshots ? '开（你能看到直播画面）' : '关（你看不到直播画面）'}`,
    ...(autoReplyThreshold === undefined
      ? []
      : [
          `- 自动回复：${autoReplyThreshold < 1 ? `开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 ${autoReplyThreshold}${interval}）` : '关闭'}`,
        ]),
    ...(thanksThreshold === undefined
      ? []
      : [
          `- 自动谢礼：${thanksThreshold >= THANKS_OFF_FROM ? '关闭' : `5 分钟内送礼超过 ${thanksThreshold} 钻的观众会收到感谢`}`,
        ]),
    ...(autoSongId === undefined
      ? []
      : [`- 自动识歌：${autoSongId ? '开（主播唱歌时，你会自己认出是什么歌并说出来）' : '关闭'}`]),
    ...(asker && askerBalance !== undefined
      ? [`- ${asker} 送的礼物还剩：${askerBalance} 钻可用`]
      : []),
  ].join('\n');
}

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat (and, among them
 * by time, `昵称: （送出 玫瑰×1，1钻）` per recent gift), `{{transcript}}`
 * one `HH:MM:SS 内容` line per sentence the streamer said (`HH:MM:SS （唱）内容` when sung, and
 * `（连线）` before it when someone they're linked up with said it), `{{asker}}` and `{{question}}` the
 * mention's sender and text, `{{asked}}` the two as a line saying they @ed the bot (or, when
 * `unprompted`, that it heard them talk to or about it), `{{singleLength}}` what fits in one message and `{{maxLength}}` the
 * most the answer may use over several, `{{now}}` the time, `{{today}}` the date and weekday
 * (`2026-10-20 星期二`), both in the room's time zone, `{{timeZone}}` that zone's name (北京时间), `{{recordTimeZone}}` the machine's
 * (which the chat record files on disk are written in), `{{chatDir}}` the folder of chat
 * record files, `{{persona}}` the line `你的人设是…` (empty without a persona), `{{aliases}}` a line saying the room's other names for the bot mean it too (empty without any), `{{botName}}`
 * the bot's own nickname, `{{context}}` the room's background under a heading (empty
 * without one), `{{intro}}` what the bot says about itself, likewise, `{{botTalk}}` what the bot said lately, `{{userHistory}}` the asker's past
 * exchanges with it and `{{userChat}}` their own recent messages (each `（暂无）` when there's
 * none), `{{settings}}` the room's settings (and the asker's balance) as a list, and
 * `{{commands}}` the commands viewers can run (both empty when not given).
 */
export function buildPrompt(template: string, input: PromptInput): string {
  const { history, transcript, singleLength, maxLength, now, chatDir, persona } = input;
  const { asker = '', question = '', botName, context, botTalk, userHistory, userChat } = input;
  const { settings, commands, askerBalance, unprompted, intro, wording } = input;
  const said = question || wording('asked-nothing');
  const values: Record<string, string> = {
    history: historyText(history, input.gifts ?? []),
    transcript:
      transcript
        .map((line) => {
          const marks = `${isGuest(line) ? '（连线）' : ''}${isSung(line) ? '（唱）' : ''}`;
          return `${clock(line.start, input.timeZone)} ${marks}${line.text}`;
        })
        .join('\n') || '（暂无）',
    asker,
    question: said,
    asked: wording(
      unprompted === 'speech'
        ? 'asked-speech'
        : unprompted === 'chat'
          ? 'asked-chat'
          : 'asked-mention',
      { asker, said },
    ),
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
    context: context?.trim() ? wording('context', { context: context.trim() }) : '',
    intro: intro?.trim() ? wording('intro', { intro: intro.trim() }) : '',
    // Written with the machine's times; shown in the room's, like the rest of the prompt.
    botTalk: retimeLines(botTalk?.trim() ?? '', input.timeZone) || '（暂无）',
    userHistory: retimeLines(userHistory?.trim() ?? '', input.timeZone) || '（暂无）',
    userChat: userChat?.trim() || '（暂无）',
    settings: settings ? settingsText(settings, asker, askerBalance) : '',
    commands: commands?.trim() ?? '',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
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
