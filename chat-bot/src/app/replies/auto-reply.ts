import { matchChat, matchSpeech } from '../../core/viewers/alias';
import { readMark, withoutReading } from '../../core/chat/reading';
import { errorMessage, OutOfCreditError } from '../../core/errors';
import {
  lineKey,
  relevanceRequest,
  roomLines,
  scoreRelevance,
  type ListenTopic,
  type RoomLine,
} from '../../core/chat/relevance';
import {
  chooseTargets,
  parseReplyPick,
  type Pick as ReplyPick,
  pickLines,
  pickPrompt,
  REPLY_PICK_SCHEMA,
  targetOf,
  type UnpromptedReply,
} from '../../core/replies/reply-pick';
import type { IncomingChat } from '../../core/chat/room-events';
import type { TranscriptLine } from '../../core/songs/transcript';
import { askJson } from '../models/ask-json';
import type { Outbox } from './outbox';
import type { Settings } from '../../core/commands/settings';
import type { AskModel, FindStreamer, Judge, Log, SettingsStore } from '../ports';
import type { BotNames } from '../room/bot-names';
import type { RoomState } from '../room/room-state';

export interface AutoReplyOptions {
  /** Where it tells the room the judge's account ran dry. */
  outbox: Pick<Outbox, 'push'>;
  /** Says how likely each new chat or sentence is about the bot. Without it, it never talks unprompted. */
  judge?: Judge;
  /** The room's settings, where the threshold and the quiet time are kept. */
  settings: SettingsStore;
  /** The chat, transcript and the rest of what the prompt knows about the room. */
  room: Pick<
    RoomState,
    'now' | 'recentChat' | 'recentTranscript' | 'persona' | 'wording' | 'botTalk'
  >;
  /** What the bot is called here, and the room's time zone. */
  names: BotNames;
  log: Log;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks at what's new. */
  checkMs?: number;
  /** Picks whom to answer of what's about the bot (Codex, cheap). */
  picker: AskModel;
  /** The picker's prompt (see pickPrompt), read each time so edits apply at once. */
  pickTemplate: () => string;
  /** Answers one thing someone said to or about the bot, like a mention (ChatBot.replyUnprompted). */
  reply: (target: UnpromptedReply) => void;
  /** Who the streamer is, so what they said can be answered as theirs; null while unknown. */
  streamer: () => Awaited<ReturnType<FindStreamer>>;
  /**
   * What the tools listen for (BotTool.listen), as they are now: Jev is asked each `when`, and a
   * line matching a `trigger` or `mentioned` has auto-reply look now. Nothing more: the tools
   * themselves are what Claude calls.
   */
  topics?: () => readonly ListenTopic[];
  /** The user ids (room_config.json's `focus`) whose every chat is answered at once, as it is now. */
  focus?: () => readonly string[];
  /** Jev's score above which a line is answered at once, without the picker (SURE_ABOUT_BOT without it). */
  sureThreshold?: number;
}

/**
 * For this long after the bot says something to someone, what they say goes to the picker without
 * asking the judge: it's likely a reply (the next move in 成语接龙, say) the judge can't tell.
 */
const FOLLOW_UP_MS = 60_000;
/** The streamer, as the bot keeps track of whom it answered: on the stream or in the chat. */
const STREAMER = '主播';

/**
 * Above this score for being about the bot, Jev is sure enough that asking Codex only adds the 9
 * seconds it takes: the line is answered at once.
 */
const SURE_ABOUT_BOT = 0.9;

/** At most this many lines go to the picker, the newest. */
const PICK_LINES = 40;
/** At most this many are answered at once. */
const MAX_PICKS = 3;

/** A tool's reply to the streamer's speech (ListenTopic.speechReply) goes out at most this often. */
const SPEECH_REPLY_GAP_MS = 60_000;

/** The threshold set when the judge's account runs dry: off. */
const OFF_FOR_NO_CREDIT = 10;

/**
 * Joins in when people talk to or about the bot. Someone calling it by its nickname or an alias is
 * answered at once (see hear, hearSpeech). Every `checkMs` it asks the judge (Jev) whether
 * anything new, chat or what the streamer said (without the chat they read out), is about the
 * bot, or what one of the tools listens for (主播会唱xxx吗); when something is at least
 * `threshold` likely, or a chat matches a tool's trigger, it has the picker choose whom to
 * answer, each through `reply`, except what Jev is surer of than SURE_ABOUT_BOT is about the bot,
 * which is answered at once. What someone the bot just answered says goes to the picker without
 * the judge.
 */
export class AutoReply {
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
  /**
   * The lines that called the bot by name, answered as they came, by lineKey, with when each was
   * said: the check that gets to them leaves them out, and forgets them.
   */
  private readonly called = new Map<string, number>();
  /** When each tool last said its speechReply, by tool name. */
  private readonly spoke = new Map<string, number>();

  constructor(private readonly options: AutoReplyOptions) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.seen = options.room.now();
  }

  /** The room's settings as they are now: the threshold (1 or more never talks unprompted) and how long it keeps quiet. */
  private get settings(): Settings {
    return this.options.settings.get();
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

  /** What the tools listen for, as they are now; none when they listen for nothing. */
  private topics() {
    return this.options.topics?.() ?? [];
  }

  /** The topics a chat may match: not those that listen to the streamer's speech (speechReply). */
  private chatTopics() {
    return this.topics().filter((topic) => topic.speechReply === undefined);
  }

  /** The topics Jev is asked about and the picker told of: those with a `when`. */
  private judgedTopics(): (ListenTopic & { when: string })[] {
    return this.topics().filter((topic): topic is ListenTopic & { when: string } => !!topic.when);
  }

  /**
   * A chat just came in. One calling the bot by its nickname or an alias, as written, is answered
   * at once, without the judge or the picker (Claude may still say nothing). One matching a tool's
   * listen trigger (主播会唱xxx吗) is surely for the bot, so it looks now instead of at the next
   * check; one matching the trigger of a tool that listens for nothing else (no `when`) is
   * answered at once, like a name. The rest wait for it, so the room has time to answer. A chat
   * from someone in `focus` is answered at once whatever it says, auto-reply on or off.
   */
  hear({
    ts,
    userId,
    nickname,
    content,
  }: Pick<IncomingChat, 'ts' | 'userId' | 'nickname' | 'content'>): void {
    if (userId === undefined) return;
    const [line] = roomLines([{ ts, userId, nickname, content }], [], this.options.names.botName);
    if (line?.candidate && this.options.focus?.().includes(userId)) {
      this.called.set(lineKey(line), line.ts);
      this.options.log.info('focus', { who: nickname, userId, text: content });
      this.options.reply({ nickname, userId, question: content, heard: 'chat' });
      return;
    }
    if (this.settings.autoReplyThreshold >= 1) return;
    const name = line?.candidate ? matchChat(content, this.options.names.callNames()) : undefined;
    if (line && name !== undefined) {
      this.callsBot(line, name, { nickname, userId, question: content, heard: 'chat' });
      return;
    }
    const triggered = this.chatTopics()
      .filter((topic) => !topic.when && topic.trigger?.test(content))
      .map((topic) => topic.name);
    if (line?.candidate && triggered.length) {
      this.called.set(lineKey(line), line.ts);
      this.options.log.info('trigger matched', { tools: triggered, who: line.who, text: content });
      this.options.reply({ nickname, userId, question: content, heard: 'chat', topics: triggered });
      return;
    }
    if (!this.chatTopics().some((topic) => matchFor(topic, content))) return;
    this.lookAtOnce(content);
  }

  /**
   * The streamer said something: calling the bot by its nickname or an alias, as speech
   * recognition may write it (「FAIRY 你来唱一首」, 「默认关壁」, an alias's `heardAs`), it's
   * answered at once, as theirs, like a chat. Reading out the bot's chat goes to the picker instead.
   * Matching the trigger of a tool that listens to speech (能理解的打一), its speechReply goes out
   * as it is, at most once a SPEECH_REPLY_GAP_MS for each tool.
   */
  hearSpeech(heard: TranscriptLine): void {
    const { room, log } = this.options;
    if (this.settings.autoReplyThreshold >= 1) return;
    // As the check sees it: not sung, not a guest, not the chat read out.
    const line = roomLines(room.recentChat(), [heard], this.options.names.botName).find(
      (l) => l.candidate && l.who === STREAMER,
    );
    if (!line) return;
    // Reading out the bot's chat isn't calling it, but they're talking with it: like after an
    // answer, what they say (this too) goes to the picker, which may leave it.
    if (line.text.includes(readMark(this.options.names.botName))) {
      this.saidTo.set(STREAMER, Math.max(this.saidTo.get(STREAMER) ?? -Infinity, line.ts));
    }
    this.replyToSpeech(line);
    const name = matchSpeech(withoutReading(line.text), this.options.names.callNames());
    if (name === undefined) return;
    const streamer = this.options.streamer();
    if (!streamer) {
      log.info('name called, streamer unknown', { name, text: line.text });
      return;
    }
    const { nickname, uid: userId } = streamer;
    this.callsBot(line, name, { nickname, userId, question: line.text, heard: 'speech' });
  }

  /** Says the speechReply of each tool whose trigger the streamer's `line` matches, unless it just did. */
  private replyToSpeech(line: RoomLine): void {
    const said = withoutReading(line.text);
    for (const { name, trigger, speechReply } of this.topics()) {
      if (speechReply === undefined || !trigger?.test(said)) continue;
      if (line.ts - (this.spoke.get(name) ?? -Infinity) < SPEECH_REPLY_GAP_MS) continue;
      this.spoke.set(name, line.ts);
      this.options.log.info('speech trigger matched', { tool: name, text: line.text });
      this.options.outbox.push({ kind: 'talk', text: speechReply });
    }
  }

  /**
   * `line` called the bot by `name`: answered now, like an @, and left out of the next check. It
   * doesn't start the quiet time, so what else was said is looked at as usual.
   */
  private callsBot(line: RoomLine, name: string, target: UnpromptedReply): void {
    this.called.set(lineKey(line), line.ts);
    this.options.log.info('name called', {
      name,
      who: line.who,
      text: line.text,
      heard: target.heard,
    });
    this.options.reply(target);
  }

  private lookAtOnce(content: string): void {
    this.options.log.debug('looking now', { content });
    if (this.waiting) this.wake();
    else this.lookNow = true;
  }

  /**
   * The bot just answered `userId` (or the streamer, by their uid): for FOLLOW_UP_MS what they say
   * goes to the picker, without the judge.
   */
  answered(userId: string): void {
    const streamer = this.options.streamer();
    this.saidTo.set(userId === streamer?.uid ? STREAMER : userId, this.options.room.now());
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
    if (!judge || this.settings.autoReplyThreshold >= 1) {
      this.seen = now;
      this.called.clear();
      return;
    }
    // While it keeps quiet, what's said waits to be looked at after.
    if (now - this.talkedAt < this.settings.autoReplyIntervalSeconds * 1000) return;
    const lines = roomLines(room.recentChat(), room.recentTranscript(), this.options.names.botName);
    // Since the last check began, so what was said while it picked and answered is looked at now.
    const since = this.seen;
    const called = new Set<string>();
    for (const [key, ts] of this.called) {
      if (ts > now) continue;
      called.add(key);
      this.called.delete(key);
    }
    const fresh = lines.filter(
      (line) => line.candidate && line.ts > since && line.ts <= now && !called.has(lineKey(line)),
    );
    this.seen = now;
    if (!fresh.length) return;
    // What someone the bot just answered says goes to the picker as it is; the rest, to the judge.
    const following = fresh.filter((line) => this.followsUp(line));
    const judged = await this.judge(
      lines,
      fresh.filter((line) => !following.includes(line)),
    );
    // Jev failing doesn't lose the follow-ups, which never needed it (unless it ran out of money,
    // which turned auto-reply off).
    if (judged === null && (!following.length || this.settings.autoReplyThreshold >= 1)) return;
    const { about, toBot, sure, best, topicsOf } = judged ?? {
      about: [],
      toBot: [],
      sure: [],
      best: null,
      topicsOf: new Map<string, readonly string[]>(),
    };
    if (!about.length && !following.length) return;
    if (best) {
      log.info('about the bot', { who: best.line.who, text: best.line.text, score: best.score });
    }
    if (following.length) {
      log.info('following up', { lines: following.map(({ who, text }) => ({ who, text })) });
    }
    // The quiet time starts only if it answered someone: picking nobody leaves it free to listen.
    const why = following.length
      ? 'follow-up'
      : about.some((line) => !toBot.includes(line))
        ? 'trigger'
        : 'judge';
    const answered = this.answerSure(sure, topicsOf);
    const picked = await this.pickAndReply(
      since,
      new Set([...called, ...sure.map(({ line }) => lineKey(line))]),
      [...about, ...following],
      why,
      topicsOf,
    );
    if (answered + picked > 0) this.talkedAt = room.now();
  }

  /**
   * Asks the judge whether each of `fresh` is about the bot or what one of the tools listens for:
   * those at least `threshold` likely either way, or matching a tool's trigger (`about`); of
   * them, those about the bot itself (`toBot`) and those it is sure about (`sure`); the likeliest
   * (for the log); and, by lineKey, the tools each line is a topic of (`topicsOf`). Null when the
   * judge failed.
   */
  private async judge(
    lines: readonly RoomLine[],
    fresh: readonly RoomLine[],
  ): Promise<{
    about: RoomLine[];
    toBot: RoomLine[];
    sure: { line: RoomLine; score: number }[];
    best: { line: RoomLine; score: number } | null;
    topicsOf: Map<string, readonly string[]>;
  } | null> {
    const { judge, room, log } = this.options;
    const topics = this.judgedTopics();
    if (!judge || !fresh.length) {
      return { about: [], toBot: [], sure: [], best: null, topicsOf: new Map() };
    }
    const first = lines.indexOf(fresh[0]!);
    const { state, questions } = relevanceRequest(
      lines.slice(Math.max(0, first - 25), first),
      fresh,
      this.options.names.botName,
      room.persona,
      room.wording,
      topics.map(({ when }) => when),
      this.options.names.aliases(),
      this.options.names.timeZone(),
    );
    let scores: Record<string, number>;
    try {
      scores = await judge(state, questions);
    } catch (err) {
      if (err instanceof OutOfCreditError) this.outOfCredit(err);
      else log.warn('could not judge', { error: errorMessage(err) });
      return null;
    }
    const {
      about,
      toBot,
      sure,
      best,
      topics: named,
    } = scoreRelevance(fresh, scores, {
      threshold: this.settings.autoReplyThreshold,
      topics: topics.map(({ name }) => name),
      matched: (line) =>
        line.userId === undefined
          ? []
          : topics.filter((topic) => matchFor(topic, line.text) !== null).map(({ name }) => name),
      sureThreshold: this.options.sureThreshold ?? SURE_ABOUT_BOT,
    });
    log.debug('judged', { lines: fresh.length, best: best.line.text, score: best.score });
    // Sure lines are answered at once, unless they're below the room's own threshold (set above 0.9).
    const certain = sure
      .filter((line) => about.includes(line))
      .map((line) => ({ line, score: scores[`q${fresh.indexOf(line) + 1}`] ?? 0 }));
    const topicsOf = new Map([...named].map(([line, names]) => [lineKey(line), names]));
    return { about, toBot, sure: certain, best: about.length ? best : null, topicsOf };
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
   * Answers at once the `sure` lines the judge found about the bot, without the picker: one for
   * each person (their latest, the most complete), as the chatter's or (said on the stream) the
   * streamer's, which waits while the streamer is unknown. How many it answered.
   */
  private answerSure(
    sure: readonly { line: RoomLine; score: number }[],
    topicsOf: ReadonlyMap<string, readonly string[]>,
  ): number {
    const { log, reply } = this.options;
    const streamer = this.options.streamer();
    const targets = new Map<string, { line: RoomLine; score: number; target: UnpromptedReply }>();
    for (const { line, score } of sure) {
      const target = targetOf(line, streamer);
      if (target) targets.set(target.userId, { line, score, target });
    }
    for (const { line, score, target } of targets.values()) {
      log.info('sure about the bot', { who: line.who, text: line.text, score });
      reply(withTopics(target, topicsOf.get(lineKey(line))));
    }
    return targets.size;
  }

  /**
   * Has the picker choose, of what was said since `since` (but `answered`, answered already), what
   * the bot should answer now (the room had time to react, so some may need no answer any more),
   * and answers each through `reply`, as the chatter's or (said on the stream) the streamer's. A
   * line is answered only if it's in `about`: the judge found it about the bot, or for one of the
   * tools' topics, or it follows up. How many it answered.
   */
  private async pickAndReply(
    since: number,
    answered: ReadonlySet<string>,
    about: readonly RoomLine[],
    why: string,
    topicsOf: ReadonlyMap<string, readonly string[]>,
  ): Promise<number> {
    const { room, log, picker, pickTemplate, reply } = this.options;
    const streamer = this.options.streamer();
    const lines = roomLines(
      room.recentChat(),
      room.recentTranscript(),
      this.options.names.botName,
    ).slice(-PICK_LINES);
    const aboutKeys = new Set(about.map(lineKey));
    const { text, numbered } = pickLines(
      lines,
      (line) =>
        line.candidate &&
        line.ts > since &&
        !answered.has(lineKey(line)) &&
        (line.userId !== undefined || (line.who === '主播' && streamer !== null)),
      new Set(lines.filter((line) => aboutKeys.has(lineKey(line)))),
      (line) =>
        line.userId === undefined
          ? []
          : this.judgedTopics()
              .map((topic) => matchFor(topic, line.text))
              .filter((label): label is string => label !== null),
      this.options.names.timeZone(),
    );
    if (!numbered.length) return 0;
    const prompt = pickPrompt(pickTemplate(), room.wording, {
      lines: text,
      botName: this.options.names.botName,
      persona: room.persona,
      botTalk: room.botTalk(),
      topics: this.judgedTopics().map(({ name, when, adminOnly }) => ({ name, when, adminOnly })),
      aliases: this.options.names.aliases(),
    });
    let picks: ReplyPick[] | null;
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
      return 0;
    }
    if (!picks) return 0;
    log.debug('picks', {
      picks: picks.map(({ line, confidence }) => ({ text: numbered[line - 1]?.text, confidence })),
    });
    // Only what it's sure enough of (the same threshold as the judge's), surest first, one each.
    const picked = chooseTargets(picks, numbered, {
      threshold: this.settings.autoReplyThreshold,
      max: MAX_PICKS,
      streamer,
      allowed: (line) => aboutKeys.has(lineKey(line)),
      note: (message, meta) => log.debug(message, meta),
    });
    log.info('picked whom to answer', {
      picked: picked.map(({ nickname, question, confidence }) => ({
        nickname,
        question,
        confidence,
      })),
    });
    for (const { nickname, userId, question, heard, line } of picked) {
      reply(withTopics({ nickname, userId, question, heard }, topicsOf.get(lineKey(line))));
    }
    return picked.length;
  }

  /**
   * The judge's account ran dry: auto-reply goes off (threshold OFF_FOR_NO_CREDIT, until an admin
   * sets it again), and the room is told.
   */
  private outOfCredit(err: OutOfCreditError): void {
    this.options.settings.set({ autoReplyThreshold: OFF_FOR_NO_CREDIT });
    this.options.log.error('jev is out of credit, auto-reply off', { error: err.message });
    this.options.outbox.push({ kind: 'system', text: '钱包烧干了，自动回复已关闭' });
  }
}

/**
 * How `text` is for the tool `topic` listens for, for the picker: its name when it matches the
 * trigger, and which of its `mentions` it contains (`can_sing（提到了它资料里的「喂猪」）`); null
 * when neither.
 */
function matchFor(
  { name, trigger, mentioned }: Pick<ListenTopic, 'name' | 'trigger' | 'mentioned'>,
  text: string,
): string | null {
  const phrase = mentioned?.(text) ?? null;
  if (phrase) return `${name}（提到了它资料里的「${phrase}」）`;
  return trigger?.test(text) ? name : null;
}

/** `target`, with the tools whose listen its line matched as a hint for Claude, when there are any. */
function withTopics(target: UnpromptedReply, topics?: readonly string[]): UnpromptedReply {
  return topics?.length ? { ...target, topics } : target;
}
