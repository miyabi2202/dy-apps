import { clock } from './local-time';
import type { ChatLine } from './room-events';
import { isGuest, isSung, type TranscriptLine } from './transcript';

/** What every prompt knows about the room as it is now. */
export interface RoomPromptInput {
  /** Recent chat before the question, oldest first. */
  history: readonly ChatLine[];
  /** What the streamer said lately, oldest first. */
  transcript: readonly TranscriptLine[];
  /** The current time, ms since the epoch. */
  now: number;
  /** The folder of the room's chat record files. */
  chatDir?: string;
  /** Who the bot plays, as admins set it. */
  persona?: string;
  /** The bot's own nickname, to spot its own messages in the chat. */
  botName?: string;
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

/** How the bot is set up in the room right now, which admins can change while it runs. */
export interface RoomSettings {
  /** Diamonds one @ costs; 0 free. */
  mentionCost: number;
  /** Whether prompts get a screenshot of the live video. */
  screenshots: boolean;
  /** How likely something must be about the bot for it to reply unprompted; 1 or more never. */
  talkThreshold: number;
  /** Viewers whose gifts within 5 minutes pass this many diamonds are thanked. */
  thanksThreshold: number;
  /** What the streamer says to make the bot talk now; empty for none. */
  wakeWord: string;
  /** Whether the bot names the songs the streamer sings without being asked. */
  autoSongId?: boolean;
}

/** A threshold this high means thanks are off: nobody gives that much in 5 minutes. */
const THANKS_OFF_FROM = 99999;

/** The room plus what's particular to one prompt: who asked what, and how long the answer may be. */
export type PromptInput = RoomPromptInput & {
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
  unprompted?: 'chat' | 'speech';
};

/** `settings` as lines for the prompt, with `asker`'s balance when known. */
function settingsText(settings: RoomSettings, asker: string, askerBalance?: number): string {
  const { mentionCost, screenshots, talkThreshold, thanksThreshold, wakeWord, autoSongId } =
    settings;
  return [
    '直播间现在的设置（管理员可以用指令修改）：',
    `- 每次 @ 你：${mentionCost > 0 ? `${mentionCost} 钻，用观众给主播送过的礼物抵（不会另外扣观众的钱）` : '免费'}`,
    `- 截图：${screenshots ? '开（你能看到直播画面）' : '关（你看不到直播画面）'}`,
    `- 自动回复：${talkThreshold < 1 ? `开（观众或主播说到你、跟你说话时，你会主动接一句；判断的阈值是 ${talkThreshold}）` : '关闭'}`,
    `- 自动谢礼：${thanksThreshold >= THANKS_OFF_FROM ? '关闭' : `5 分钟内送礼超过 ${thanksThreshold} 钻的观众会收到感谢`}`,
    `- 唤醒词：${wakeWord ? `「${wakeWord}」（主播说出来，你就会主动说一句，不收费）` : '无'}`,
    ...(autoSongId === undefined
      ? []
      : [`- 自动识歌：${autoSongId ? '开（主播唱歌时，你会自己认出是什么歌并说出来）' : '关闭'}`]),
    ...(asker && askerBalance !== undefined
      ? [`- ${asker} 送的礼物还剩：${askerBalance} 钻可用`]
      : []),
  ].join('\n');
}

/**
 * Fills a prompt template: `{{history}}` becomes one `昵称: 内容` line per chat, `{{transcript}}`
 * one `HH:MM:SS 内容` line per sentence the streamer said (`HH:MM:SS （唱）内容` when sung, and
 * `（连线）` before it when someone they're linked up with said it), `{{asker}}` and `{{question}}` the
 * mention's sender and text, `{{asked}}` the two as a line saying they @ed the bot (or, when
 * `unprompted`, that it heard them talk to or about it), `{{singleLength}}` what fits in one message and `{{maxLength}}` the
 * most the answer may use over several, `{{now}}` the time, `{{chatDir}}` the folder of chat
 * record files, `{{persona}}` the line `你的人设是…` (empty without a persona), `{{botName}}`
 * the bot's own nickname, `{{context}}` the room's background under a heading (empty
 * without one), `{{intro}}` what the bot says about itself, likewise, `{{botTalk}}` what the bot said lately, `{{userHistory}}` the asker's past
 * exchanges with it and `{{userChat}}` their own recent messages (each `（暂无）` when there's
 * none), `{{settings}}` the room's settings (and the asker's balance) as a list, and
 * `{{commands}}` the commands viewers can run (both empty when not given).
 */
export function buildPrompt(template: string, input: PromptInput): string {
  const { history, transcript, singleLength, maxLength, now, chatDir, persona } = input;
  const { asker = '', question = '', botName, context, botTalk, userHistory, userChat } = input;
  const { settings, commands, askerBalance, unprompted, intro } = input;
  const said = question || '（只 @ 了你，没有说别的）';
  const values: Record<string, string> = {
    history: history.map((line) => `${line.nickname}: ${line.content}`).join('\n') || '（暂无）',
    transcript:
      transcript
        .map((line) => {
          const marks = `${isGuest(line) ? '（连线）' : ''}${isSung(line) ? '（唱）' : ''}`;
          return `${clock(line.start)} ${marks}${line.text}`;
        })
        .join('\n') || '（暂无）',
    asker,
    question: said,
    asked:
      unprompted === 'speech'
        ? `主播 ${asker} 没有 @ 你，是在直播里说到了你（语音识别，可能有错字），你主动回 TA 一句：${said}`
        : unprompted === 'chat'
          ? `${asker} 没有 @ 你，是在弹幕里说到了你或在跟你说话，你主动回 TA 一句：${said}`
          : `${asker} @ 了你：${said}`,
    singleLength: String(singleLength),
    maxLength: String(maxLength),
    now: clock(now),
    chatDir: chatDir ?? '（无）',
    persona: persona ? `你的人设是${persona}` : '',
    botName: botName ?? '',
    context: context?.trim() ? `关于这个直播间的背景资料：\n\n${context.trim()}` : '',
    intro: intro?.trim()
      ? `关于你自己（有人问起你是谁、谁做的、能做什么时，照这个回答，口径保持一致，不要编别的）：\n\n${intro.trim()}`
      : '',
    botTalk: botTalk?.trim() || '（暂无）',
    userHistory: userHistory?.trim() || '（暂无）',
    userChat: userChat?.trim() || '（暂无）',
    settings: settings ? settingsText(settings, asker, askerBalance) : '',
    commands: commands?.trim() ?? '',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}
