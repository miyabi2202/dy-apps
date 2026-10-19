import { errorMessage, OutOfCreditError } from '../core/errors';
import { relevanceRequest, roomLines, type RoomLine } from '../core/relevance';
import { parseReplyPick, pickLines, pickPrompt, REPLY_PICK_SCHEMA } from '../core/reply-pick';
import { done, failed, type Command } from './command';
import type { UnpromptedReply } from './mention-answerer';
import type { Outbox } from './outbox';
import type { AskClaude, FindStreamer, Judge, Log } from './ports';
import type { RoomState } from './room-state';

export interface AutoReplyOptions {
  /** Where it tells the room the judge's account ran dry. */
  outbox: Pick<Outbox, 'push'>;
  /** Says how likely each new chat or sentence is about the bot. Without it, it never talks unprompted. */
  judge?: Judge;
  /** Talk when something new is about the bot at least this likely; 1 or more never, without asking. */
  threshold: number;
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
  picker: AskClaude;
  /** The picker's prompt (see pickPrompt), read each time so edits apply at once. */
  pickTemplate: () => string;
  /** Answers one thing someone said to or about the bot, like a mention (ChatBot.replyUnprompted). */
  reply: (target: UnpromptedReply) => void;
  /** Who the streamer is, so what they said can be answered as theirs; null while unknown. */
  streamer: () => Awaited<ReturnType<FindStreamer>>;
}

/**
 * For this long after the bot says something to someone, what they say goes to the picker without
 * asking the judge: it's likely a reply (the next move in 成语接龙, say) the judge can't tell.
 */
const FOLLOW_UP_MS = 60_000;
/** Whom the bot said something to without @ing anyone: the streamer. */
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
 * bot; when something is at least `threshold` likely, it has the picker choose whom to answer, each
 * through `reply`. What someone the bot just answered says goes to the picker without the judge.
 */
export class AutoReply {
  /** Talk when something is about the bot at least this likely; 1 or more never. */
  threshold: number;
  private stopped = false;
  /** Ends the current wait early, when it stops. */
  private wake: () => void = () => {};
  private readonly sleep: (ms: number) => Promise<void>;
  /** Up to when the room has been looked at; what was said before it is old news. */
  private seen: number;
  /** When it last talked, or started to. */
  private talkedAt = -Infinity;
  /** When the bot last said something to each person, by user id (STREAMER for the streamer). */
  private readonly saidTo = new Map<string, number>();

  constructor(private readonly options: AutoReplyOptions) {
    this.threshold = options.threshold;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.seen = options.room.now();
  }

  /** Runs until `stop()`. */
  async run(): Promise<void> {
    const { checkMs = 20_000 } = this.options;
    while (!this.stopped) {
      if ((await this.wait(checkMs)) === 'woken' || this.stopped) continue;
      await this.check();
    }
  }

  stop(): void {
    this.stopped = true;
    this.wake();
  }

  /**
   * The bot just said something to the room, which mostly means the streamer: it keeps quiet for
   * a while, and for FOLLOW_UP_MS what the streamer says goes to the picker, without the judge.
   */
  spokeToRoom(): void {
    const now = this.options.room.now();
    this.talkedAt = now;
    this.saidTo.set(STREAMER, now);
  }

  /**
   * The bot just answered `userId` (or the streamer, by their uid): for FOLLOW_UP_MS what they say
   * goes to the picker, without the judge.
   */
  answered(userId: string): void {
    const streamer = this.options.streamer();
    this.saidTo.set(userId === streamer?.uid ? STREAMER : userId, this.options.room.now());
  }

  /** `/自动回复阈值 0.6` sets the threshold (1 or more: never unprompted). */
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
    ];
  }

  /** Waits `ms`, or until woken: which of the two ended it. */
  private wait(ms: number): Promise<'elapsed' | 'woken'> {
    return new Promise((resolve) => {
      this.wake = () => resolve('woken');
      void this.sleep(ms).then(() => resolve('elapsed'));
    });
  }

  /** Asks the judge about what's new since it last looked, and talks if it's about the bot. */
  private async check(): Promise<void> {
    const { judge, room, log, quietMs = 60_000 } = this.options;
    const now = room.now();
    if (!judge || this.threshold >= 1) {
      this.seen = now;
      return;
    }
    // While it keeps quiet, what's said waits to be looked at after.
    if (now - this.talkedAt < quietMs) return;
    const lines = roomLines(room.recentChat(), room.recentTranscript(), room.botName);
    const since = Math.max(this.seen, this.talkedAt);
    const fresh = lines.filter((line) => line.candidate && line.ts > since && line.ts <= now);
    this.seen = now;
    if (!fresh.length) return;
    // What someone the bot just answered says goes to the picker as it is; the rest, to the judge.
    const following = fresh.filter((line) => this.followsUp(line));
    const judged = await this.judge(
      lines,
      fresh.filter((line) => !following.includes(line)),
    );
    if (judged === null) return;
    const { about, best } = judged;
    if (!about.length && !following.length) return;
    if (best) {
      log.info('about the bot', { who: best.line.who, text: best.line.text, score: best.score });
    }
    if (following.length) {
      log.info('following up', { lines: following.map(({ who, text }) => ({ who, text })) });
    }
    this.talkedAt = now;
    await this.pickAndReply(since, [...about, ...following]);
    this.talkedAt = room.now();
  }

  /**
   * Asks the judge whether each of `fresh` is about the bot: those at least `threshold` likely, and
   * the likeliest of them (for the log); null when the judge failed.
   */
  private async judge(
    lines: readonly RoomLine[],
    fresh: readonly RoomLine[],
  ): Promise<{ about: RoomLine[]; best: { line: RoomLine; score: number } | null } | null> {
    const { judge, room, log } = this.options;
    if (!judge || !fresh.length) return { about: [], best: null };
    const first = lines.indexOf(fresh[0]!);
    const { state, questions } = relevanceRequest(
      lines.slice(Math.max(0, first - 25), first),
      fresh,
      room.botName,
      room.persona,
    );
    let scores: Record<string, number>;
    try {
      scores = await judge(state, questions);
    } catch (err) {
      if (err instanceof OutOfCreditError) this.outOfCredit(err);
      else log.warn('could not judge', { error: errorMessage(err) });
      return null;
    }
    const scored = fresh.map((line, i) => ({ line, score: scores[`q${i + 1}`] ?? 0 }));
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    log.debug('judged', { lines: fresh.length, best: best.line.text, score: best.score });
    const about = scored.filter(({ score }) => score >= this.threshold).map(({ line }) => line);
    return { about, best: about.length ? best : null };
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
   * `reply`, as the chatter's or (said on the stream) the streamer's.
   */
  private async pickAndReply(since: number, about: readonly RoomLine[]): Promise<void> {
    const { room, log, picker, pickTemplate, reply } = this.options;
    const streamer = this.options.streamer();
    const lines = roomLines(room.recentChat(), room.recentTranscript(), room.botName).slice(
      -PICK_LINES,
    );
    const key = (line: RoomLine) => `${line.ts} ${line.who} ${line.text}`;
    const aboutKeys = new Set(about.map(key));
    const { text, numbered } = pickLines(
      lines,
      (line) =>
        line.candidate &&
        line.ts > since &&
        (line.userId !== undefined || (line.who === '主播' && streamer !== null)),
      new Set(lines.filter((line) => aboutKeys.has(key(line)))),
    );
    if (!numbered.length) return;
    const prompt = pickPrompt(pickTemplate(), {
      lines: text,
      botName: room.botName,
      persona: room.persona,
      botTalk: room.promptInput().botTalk ?? '',
    });
    let answer: string;
    try {
      answer = await picker({ prompt, schema: REPLY_PICK_SCHEMA });
    } catch (err) {
      log.warn('could not pick whom to answer', { error: errorMessage(err) });
      return;
    }
    const picks = parseReplyPick(answer);
    if (!picks) {
      log.warn('reply pick is not json', { answer });
      return;
    }
    log.debug('picks', {
      picks: picks.map(({ line, confidence }) => ({ text: numbered[line - 1]?.text, confidence })),
    });
    // Only what it's sure enough of (the same threshold as the judge's), surest first, one each.
    const targets = new Map<string, UnpromptedReply & { confidence: number }>();
    const sure = picks
      .filter(({ confidence }) => confidence >= this.threshold)
      .sort((a, b) => b.confidence - a.confidence);
    for (const { line: n, confidence } of sure) {
      const line = numbered[n - 1];
      if (!line) continue;
      const target: UnpromptedReply | null = line.userId
        ? { nickname: line.who, userId: line.userId, question: line.text, heard: 'chat' }
        : streamer && {
            nickname: streamer.nickname,
            userId: streamer.uid,
            question: line.text,
            heard: 'speech',
          };
      if (target && !targets.has(target.userId))
        targets.set(target.userId, { ...target, confidence });
    }
    const picked = [...targets.values()].slice(0, MAX_PICKS);
    log.info('picked whom to answer', {
      picked: picked.map(({ nickname, question, confidence }) => ({
        nickname,
        question,
        confidence,
      })),
    });
    for (const { nickname, userId, question, heard } of picked) {
      reply({ nickname, userId, question, heard });
    }
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
