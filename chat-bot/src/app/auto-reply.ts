import { matchName } from '../core/alias';
import { errorMessage, OutOfCreditError } from '../core/errors';
import {
  lineKey,
  relevanceRequest,
  roomLines,
  scoreRelevance,
  type RoomLine,
} from '../core/relevance';
import {
  chooseTargets,
  parseReplyPick,
  type Pick as ReplyPick,
  pickLines,
  pickPrompt,
  REPLY_PICK_SCHEMA,
  type UnpromptedReply,
} from '../core/reply-pick';
import { askJson } from './ask-json';
import { done, failed, type Command } from './command';
import type { Outbox } from './outbox';
import { setting } from './setting';
import type { AdditionalCommand, AskModel, FindStreamer, Judge, Log, SettingsStore } from './ports';
import type { RoomState } from './room-state';

export interface AutoReplyOptions {
  /** Where it tells the room the judge's account ran dry. */
  outbox: Pick<Outbox, 'push'>;
  /** Says how likely each new chat or sentence is about the bot. Without it, it never talks unprompted. */
  judge?: Judge;
  /** Talk when something new is about the bot at least this likely; 1 or more never, without asking. Without `settings`, what it starts as. */
  threshold: number;
  /** The room's settings, where the threshold and the quiet time are kept. */
  settings?: SettingsStore;
  /** The chat, transcript and the rest of what the prompt knows about the room. */
  room: RoomState;
  log: Log;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks at what's new. */
  checkMs?: number;
  /** At least this long between two things it says unprompted, or after being asked to talk. */
  quietMs?: number;
  /** Picks whom to answer of what's about the bot (Codex, cheap). */
  picker: AskModel;
  /** The picker's prompt (see pickPrompt), read each time so edits apply at once. */
  pickTemplate: () => string;
  /** Answers one thing someone said to or about the bot, like a mention (ChatBot.replyUnprompted). */
  reply: (target: UnpromptedReply) => void;
  /** Who the streamer is, so what they said can be answered as theirs; null while unknown. */
  streamer: () => Awaited<ReturnType<FindStreamer>>;
  /**
   * The room's own commands, as they are now (their files are read again as they change): what's
   * said that one is for (asked of the judge, or matching its trigger) goes to the picker too,
   * which may have it answered with that command.
   */
  additionalCommands?: () => readonly Pick<
    AdditionalCommand,
    'id' | 'when' | 'trigger' | 'mentioned'
  >[];
}

/**
 * For this long after the bot says something to someone, what they say goes to the picker without
 * asking the judge: it's likely a reply (the next move in 成语接龙, say) the judge can't tell.
 */
const FOLLOW_UP_MS = 60_000;
/** The streamer, as the bot keeps track of whom it answered: on the stream or in the chat. */
const STREAMER = '主播';

/** At most this many lines go to the picker, the newest. */
const PICK_LINES = 40;
/** At most this many are answered at once. */
const MAX_PICKS = 3;

/** The threshold set when the judge's account runs dry: off. */
const OFF_FOR_NO_CREDIT = 10;

/**
 * Joins in when people talk to or about the bot. Every `checkMs` it asks the judge (Jev) whether
 * anything new, chat or what the streamer said (without the chat they read out), is about the
 * bot, or what one of the room's own commands is for (主播会唱xxx吗); when something is at least
 * `threshold` likely, or a chat matches a command's trigger, it has the picker choose whom to
 * answer, and with which command, each through `reply`. What someone the bot just answered says
 * goes to the picker without the judge.
 */
export class AutoReply {
  private readonly thresholdSetting: ReturnType<typeof setting<'autoReplyThreshold'>>;
  private readonly quietSetting: ReturnType<typeof setting<'autoReplyIntervalSeconds'>>;
  private stopped = false;
  /** Ends the current wait early: to stop, or to look now. */
  private wake: () => void = () => {};
  /** Whether it's waiting; when not, a chat to look at now waits for the next wait to end at once. */
  private waiting = false;
  /** Something was said to look at now while it wasn't waiting. */
  private lookNow = false;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Up to when the room has been looked at; what was said before it is old news. */
  private seen: number;
  /** When it last talked, or started to. */
  private talkedAt = -Infinity;
  /** When the bot last said something to each person, by user id (STREAMER for the streamer). */
  private readonly saidTo = new Map<string, number>();

  constructor(private readonly options: AutoReplyOptions) {
    this.thresholdSetting = setting(options.settings, 'autoReplyThreshold', options.threshold);
    this.quietSetting = setting(
      options.settings,
      'autoReplyIntervalSeconds',
      (options.quietMs ?? 60_000) / 1000,
    );
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.seen = options.room.now();
  }

  /** Talk when something is about the bot at least this likely; 1 or more never. */
  get threshold(): number {
    return this.thresholdSetting.get();
  }

  set threshold(threshold: number) {
    this.thresholdSetting.set(threshold);
  }

  /** At least this long between two things it says unprompted; 0 doesn't wait. */
  get quietMs(): number {
    return this.quietSetting.get() * 1000;
  }

  set quietMs(ms: number) {
    this.quietSetting.set(ms / 1000);
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    const { checkMs = 20_000 } = this.options;
    while (!this.stopped) {
      if (this.lookNow) this.lookNow = false;
      else await this.wait(checkMs);
      if (this.stopped) break;
      await this.check();
    }
  }

  stop(): void {
    this.stopped = true;
    this.wake();
  }

  /** The room's own commands as they are now; none when it has none. */
  private additionalCommands() {
    return this.options.additionalCommands?.() ?? [];
  }

  /**
   * A chat just came in: one matching a room command's trigger (主播会唱xxx吗) is surely for the bot,
   * so it looks now instead of at the next check. The rest wait for it, so the room has time to answer.
   */
  hear({ userId, content }: { userId?: string; content: string }): void {
    if (this.threshold >= 1 || userId === undefined) return;
    const additionalCommands = this.additionalCommands();
    const named = matchName(content, this.names()) !== undefined;
    if (!named && !additionalCommands.some((command) => matchFor(command, content))) return;
    this.lookAtOnce(content);
  }

  /**
   * The streamer said something: one with an alias of the bot's in it (「Fairy 你来唱一首」,
   * as speech recognition wrote it) is surely about the bot, so it looks now, like for a chat.
   */
  hearSpeech({ text }: { text: string }): void {
    if (this.threshold >= 1 || matchName(text, this.names()) === undefined) return;
    this.lookAtOnce(text);
  }

  private lookAtOnce(content: string): void {
    this.options.log.debug('looking now', { content });
    if (this.waiting) this.wake();
    else this.lookNow = true;
  }

  /** The names that mean the bot: its nickname, and the room's aliases for it. */
  /**
   * The room's aliases for the bot (room_config.json). Not its account name: that can be an everyday
   * phrase (「默认关闭」), so lines with it go through the judge as before, not straight to Codex.
   */
  private names(): readonly string[] {
    return this.options.room.aliases();
  }

  /**
   * The bot just answered `userId` (or the streamer, by their uid): for FOLLOW_UP_MS what they say
   * goes to the picker, without the judge.
   */
  answered(userId: string): void {
    const streamer = this.options.streamer();
    this.saidTo.set(userId === streamer?.uid ? STREAMER : userId, this.options.room.now());
  }

  /** What `{{settings}}` says of it: the threshold and how long it keeps quiet. */
  settings(): { autoReplyThreshold: number; autoReplyIntervalMs: number } {
    return { autoReplyThreshold: this.threshold, autoReplyIntervalMs: this.quietMs };
  }

  /**
   * `/自动回复阈值 0.6` sets the threshold (1 or more: never unprompted); `/自动回复间隔 20` how many
   * seconds it keeps quiet after talking.
   */
  commands(): Command[] {
    return [
      {
        name: '自动回复阈值',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!/^\d+(\.\d+)?$/.test(args))
            return failed('阈值要写成 0 到 1 之间的小数，1 表示关闭，用法：/自动回复阈值 0.6');
          this.threshold = Number(args);
          this.options.log.info('talk threshold', { threshold: this.threshold });
          return done('已处理自动回复阈值请求');
        },
      },
      {
        name: '自动回复间隔',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (!/^\d+$/.test(args))
            return failed('间隔要写成秒数，0 表示不等，用法：/自动回复间隔 20');
          this.quietMs = Number(args) * 1000;
          this.options.log.info('talk interval', { quietMs: this.quietMs });
          return done('已处理自动回复间隔请求');
        },
      },
    ];
  }

  /** Waits `ms`, or until woken: which of the two ended it. */
  private wait(ms: number): Promise<'elapsed' | 'woken'> {
    this.waiting = true;
    return new Promise<'elapsed' | 'woken'>((resolve) => {
      this.wake = () => resolve('woken');
      void this.sleep(ms).then(() => resolve('elapsed'));
    }).finally(() => (this.waiting = false));
  }

  /** Asks the judge about what's new since it last looked, and talks if it's about the bot. */
  private async check(): Promise<void> {
    const { judge, room, log } = this.options;
    const now = room.now();
    if (!judge || this.threshold >= 1) {
      this.seen = now;
      return;
    }
    // While it keeps quiet, what's said waits to be looked at after.
    if (now - this.talkedAt < this.quietMs) return;
    const lines = roomLines(room.recentChat(), room.recentTranscript(), room.botName);
    // Since the last check began, so what was said while it picked and answered is looked at now.
    const since = this.seen;
    const fresh = lines.filter((line) => line.candidate && line.ts > since && line.ts <= now);
    this.seen = now;
    if (!fresh.length) return;
    // What someone the bot just answered says goes to the picker as it is; the rest, to the judge.
    const following = fresh.filter((line) => this.followsUp(line));
    // Someone calling the bot by its name or an alias is about it without asking the judge too;
    // the picker still decides whether to answer.
    const names = this.names();
    const aliased = new Map<string, string>();
    for (const line of fresh) {
      const alias = matchName(line.text, names);
      if (alias !== undefined) aliased.set(lineKey(line), alias);
    }
    const direct = fresh.filter((line) => following.includes(line) || aliased.has(lineKey(line)));
    const judged = await this.judge(
      lines,
      fresh.filter((line) => !direct.includes(line)),
    );
    // Jev failing doesn't lose the follow-ups, which never needed it (unless it ran out of money,
    // which turned auto-reply off).
    if (judged === null && (!direct.length || this.threshold >= 1)) return;
    const { about, toBot, best } = judged ?? { about: [], toBot: [], best: null };
    if (!about.length && !direct.length) return;
    if (best) {
      log.info('about the bot', { who: best.line.who, text: best.line.text, score: best.score });
    }
    if (following.length) {
      log.info('following up', { lines: following.map(({ who, text }) => ({ who, text })) });
    }
    // The quiet time starts only if it answered someone: picking nobody leaves it free to listen.
    const why = aliased.size
      ? 'alias'
      : following.length
        ? 'follow-up'
        : about.some((line) => !toBot.includes(line))
          ? 'trigger'
          : 'judge';
    const picked = await this.pickAndReply(since, [...about, ...direct], [...toBot, ...direct], {
      why,
      aliased,
    });
    if (picked > 0) this.talkedAt = room.now();
  }

  /**
   * Asks the judge whether each of `fresh` is about the bot or for one of the room's commands:
   * those at least `threshold` likely either way, or matching a command's trigger (`about`); of
   * them, those about the bot itself (`toBot`); and the likeliest (for the log). Null when the judge
   * failed.
   */
  private async judge(
    lines: readonly RoomLine[],
    fresh: readonly RoomLine[],
  ): Promise<{
    about: RoomLine[];
    toBot: RoomLine[];
    best: { line: RoomLine; score: number } | null;
  } | null> {
    const { judge, room, log } = this.options;
    const additionalCommands = this.additionalCommands();
    if (!judge || !fresh.length) return { about: [], toBot: [], best: null };
    const first = lines.indexOf(fresh[0]!);
    const { state, questions } = relevanceRequest(
      lines.slice(Math.max(0, first - 25), first),
      fresh,
      room.botName,
      room.persona,
      room.wording,
      additionalCommands.map(({ when }) => when),
      room.aliases(),
      room.timeZone(),
    );
    let scores: Record<string, number>;
    try {
      scores = await judge(state, questions);
    } catch (err) {
      if (err instanceof OutOfCreditError) this.outOfCredit(err);
      else log.warn('could not judge', { error: errorMessage(err) });
      return null;
    }
    const { about, toBot, best } = scoreRelevance(fresh, scores, {
      threshold: this.threshold,
      topics: additionalCommands.length,
      triggered: (line) =>
        line.userId !== undefined &&
        additionalCommands.some((command) => matchFor(command, line.text)),
    });
    log.debug('judged', { lines: fresh.length, best: best.line.text, score: best.score });
    return { about, toBot, best: about.length ? best : null };
  }

  /** Whether `line` was said by someone within FOLLOW_UP_MS of the bot saying something to them. */
  private followsUp(line: RoomLine): boolean {
    const streamer = this.options.streamer();
    const who =
      line.who === STREAMER && line.userId === undefined
        ? STREAMER
        : line.userId !== undefined && line.userId === streamer?.uid
          ? STREAMER
          : line.userId;
    const at = who === undefined ? undefined : this.saidTo.get(who);
    return at !== undefined && line.ts >= at && line.ts - at <= FOLLOW_UP_MS;
  }

  /**
   * Has the picker choose, of what was said since `since`, what the bot should answer now (the
   * room had time to react, so some may need no answer any more), and answers each through
   * `reply`, as the chatter's or (said on the stream) the streamer's. A line is answered as usual
   * (no command) only if it's in `chatty`, the judge found it about the bot or it follows up: one
   * that came only for a room command (its `when`, its trigger) is answered with a command or not
   * at all. How many it answered.
   */
  private async pickAndReply(
    since: number,
    about: readonly RoomLine[],
    chatty: readonly RoomLine[],
    { why, aliased }: { why: string; aliased: ReadonlyMap<string, string> },
  ): Promise<number> {
    const { room, log, picker, pickTemplate, reply } = this.options;
    const streamer = this.options.streamer();
    const lines = roomLines(room.recentChat(), room.recentTranscript(), room.botName).slice(
      -PICK_LINES,
    );
    const aboutKeys = new Set(about.map(lineKey));
    const chattyKeys = new Set(chatty.map(lineKey));
    const { text, numbered } = pickLines(
      lines,
      (line) =>
        line.candidate &&
        line.ts > since &&
        (line.userId !== undefined || (line.who === '主播' && streamer !== null)),
      new Set(lines.filter((line) => aboutKeys.has(lineKey(line)))),
      (line) =>
        line.userId === undefined
          ? []
          : this.additionalCommands()
              .map((command) => matchFor(command, line.text))
              .filter((label): label is string => label !== null),
      room.timeZone(),
    );
    if (!numbered.length) return 0;
    const prompt = pickPrompt(pickTemplate(), room.wording, {
      lines: text,
      botName: room.botName,
      persona: room.persona,
      botTalk: room.botTalk(),
      commands: this.additionalCommands(),
      aliases: room.aliases(),
    });
    // The lines that came for the bot's name or an alias, for the log: how often that's right.
    const named = numbered.filter((line) => aliased.has(lineKey(line)));
    for (const line of named) {
      log.info('alias matched', {
        alias: aliased.get(lineKey(line)),
        who: line.who,
        text: line.text,
      });
    }
    const aliasPick = (picked: readonly { userId: string; question: string }[], fail?: string) => {
      for (const line of named) {
        const n = numbered.indexOf(line) + 1;
        const confidence = picks?.find((p) => p.line === n)?.confidence;
        const answered = picked.some(
          (t) => t.question === line.text && t.userId === (line.userId ?? streamer?.uid),
        );
        log.info('alias pick', {
          alias: aliased.get(lineKey(line)),
          text: line.text,
          answered,
          confidence,
          ...(fail && { error: fail }),
        });
      }
    };
    let picks: ReplyPick[] | null = null;
    try {
      ({ value: picks } = await askJson(
        picker,
        { prompt, why },
        {
          schema: REPLY_PICK_SCHEMA,
          parse: parseReplyPick,
          notJson: 'reply pick is not json',
          field: 'answer',
        },
        log,
      ));
    } catch (err) {
      log.warn('could not pick whom to answer', { error: errorMessage(err) });
      aliasPick([], errorMessage(err));
      return 0;
    }
    if (!picks) {
      aliasPick([], 'the answer is not json');
      return 0;
    }
    log.debug('picks', {
      picks: picks.map(({ line, confidence }) => ({ text: numbered[line - 1]?.text, confidence })),
    });
    // Only what it's sure enough of (the same threshold as the judge's), surest first, one each.
    const additionalCommands = this.additionalCommands();
    const picked = chooseTargets(picks, numbered, {
      threshold: this.threshold,
      max: MAX_PICKS,
      streamer,
      commandIds: new Set(additionalCommands.map(({ id }) => id)),
      chatty: (line) => chattyKeys.has(lineKey(line)),
      cameFor: (line) =>
        additionalCommands.find((c) => line.userId !== undefined && matchFor(c, line.text) !== null)
          ?.id,
      note: (message, meta) => log.debug(message, meta),
    });
    aliasPick(picked);
    log.info('picked whom to answer', {
      picked: picked.map(({ nickname, question, confidence, command }) => ({
        nickname,
        question,
        confidence,
        command,
      })),
    });
    for (const { nickname, userId, question, heard, command } of picked) {
      reply({ nickname, userId, question, heard, ...(command && { command }) });
    }
    return picked.length;
  }

  /**
   * The judge's account ran dry: auto-reply goes off (threshold OFF_FOR_NO_CREDIT, until an admin
   * sets it again), and the room is told.
   */
  private outOfCredit(err: OutOfCreditError): void {
    this.threshold = OFF_FOR_NO_CREDIT;
    this.options.log.error('jev is out of credit, auto-reply off', { error: err.message });
    this.options.outbox.push({ kind: 'system', text: '钱包烧干了，自动回复已关闭' });
  }
}

/**
 * How `text` is for the room's `command`, for the picker: its id when it matches the trigger, and
 * which of its `mentions` it contains (`can-sing（提到了它资料里的「喂猪」）`); null when neither.
 */
function matchFor(
  { id, trigger, mentioned }: Pick<AdditionalCommand, 'id' | 'trigger' | 'mentioned'>,
  text: string,
): string | null {
  const phrase = mentioned?.(text) ?? null;
  if (phrase) return `${id}（提到了它资料里的「${phrase}」）`;
  return trigger?.test(text) ? id : null;
}
