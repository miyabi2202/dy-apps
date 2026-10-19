import { errorMessage, OutOfCreditError } from '../core/errors';
import { buildPrompt } from '../core/prompt';
import { relevanceRequest, roomLines, type RoomLine } from '../core/relevance';
import { DOUYIN_CHAT_LIMIT, plainMessage } from '../core/reply';
import { parseReplyPick, pickLines, pickPrompt, REPLY_PICK_SCHEMA } from '../core/reply-pick';
import { parseTalkAnswer, TALK_ANSWER_SCHEMA } from '../core/talk-answer';
import type { UnpromptedReply } from './chat-bot';
import { done, failed, type Command } from './command';
import type { OutgoingMessage, Outbox } from './outbox';
import type { AskClaude, FindStreamer, Judge, Log } from './ports';
import type { RoomState } from './room-state';

export interface TalkerOptions {
  ask: AskClaude;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (see buildPrompt for what it can fill in), read each time so edits apply at once. */
  promptTemplate: () => string;
  /** Says how likely each new chat or sentence is about the bot. Without it, it only talks when asked. */
  judge?: Judge;
  /** Talk when something new is about the bot at least this likely; 1 or more never, without asking. */
  threshold: number;
  /** The chat, transcript and the rest of what the prompt knows about the room. */
  room: RoomState;
  /** Douyin's chat length limit. */
  maxLength?: number;
  log: Log;
  /** Waits `ms`; tests pass one that doesn't. */
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks at what's new. */
  checkMs?: number;
  /**
   * How long it waits after something about the bot before talking, so the streamer can answer
   * first; none by default, as picking whom to answer and answering take a while anyway.
   */
  reactionMs?: number;
  /** At least this long between two things it says unprompted, or after being asked to talk. */
  quietMs?: number;
  /**
   * Picks whom to answer (Codex, cheap): with it and `reply`, what's about the bot is answered
   * through `reply`, to each one the picker picks, rather than with one message from `ask`.
   */
  picker?: AskClaude;
  /** The picker's prompt (see pickPrompt), read each time so edits apply at once. */
  pickTemplate?: () => string;
  /** Answers one thing someone said to or about the bot, like a mention (ChatBot.replyUnprompted). */
  reply?: (target: UnpromptedReply) => void;
  /** Who the streamer is, so what they said can be answered as theirs; null while unknown. */
  streamer?: () => Awaited<ReturnType<FindStreamer>>;
}

/** At most this many lines go to the picker, the newest. */
const PICK_LINES = 40;
/** At most this many are answered at once. */
const MAX_PICKS = 3;

/** The threshold set when the judge's account runs dry: off. */
const OFF_FOR_NO_CREDIT = 10;

/** Why it talks when the streamer says the wake word. */
export const WOKEN = '主播说了唤醒词。';

/**
 * Has Claude say something to the streamer unprompted, as fits what's going on: from what the
 * streamer said and sang and the chat lately, and the video when there's a screenshot. Every
 * `checkMs` it asks the judge (Jev) whether anything new, chat or what the streamer said (without
 * the chat they read out), is about the bot; when something is at least `threshold` likely, it
 * waits `reactionMs` (none by default) and then has the picker choose whom to answer, each through
 * `reply`, or, without a picker, has Claude decide whether a reply is still needed and say it
 * (TALK_ANSWER_SCHEMA). It also talks whenever `talkNow` asks (the wake word).
 */
export class Talker {
  /** Talk when something is about the bot at least this likely; 1 or more never. */
  threshold: number;
  private stopped = false;
  /** Ends the current wait early, when the talker stops. */
  private wake: () => void = () => {};
  private readonly sleep: (ms: number) => Promise<void>;
  /** Up to when the room has been looked at; what was said before it is old news. */
  private seen: number;
  /** When it last talked, or started to. */
  private talkedAt = -Infinity;

  constructor(private readonly options: TalkerOptions) {
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
   * Says something now, whatever's going on, sent as `kind`, telling Claude `why`; what it said,
   * or null if nothing.
   */
  async talkNow(kind: OutgoingMessage['kind'], why: string): Promise<string | null> {
    this.talkedAt = this.options.room.now();
    return this.say(kind, why);
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
    const { judge, room, log, quietMs = 60_000, reactionMs = 0 } = this.options;
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
      if (err instanceof OutOfCreditError) {
        this.outOfCredit(err);
        return;
      }
      log.warn('could not judge', { error: errorMessage(err) });
      return;
    }
    const best = fresh
      .map((line, i) => ({ line, score: scores[`q${i + 1}`] ?? 0 }))
      .reduce((a, b) => (b.score > a.score ? b : a));
    log.debug('judged', { lines: fresh.length, best: best.line.text, score: best.score });
    if (best.score < this.threshold) return;
    log.info('about the bot', { who: best.line.who, text: best.line.text, score: best.score });
    this.talkedAt = now;
    if (reactionMs > 0 && ((await this.wait(reactionMs)) === 'woken' || this.stopped)) return;
    const { picker, reply } = this.options;
    if (picker && reply) {
      const about = fresh.filter((_, i) => (scores[`q${i + 1}`] ?? 0) >= this.threshold);
      await this.pickAndReply(since, about, picker, reply);
    } else await this.say('talk', followUp(best.line));
    this.talkedAt = room.now();
  }

  /**
   * Has the picker choose, of what was said since `since`, what the bot should answer now (the
   * room had time to react, so some may need no answer any more), and answers each through
   * `reply`, as the chatter's or (said on the stream) the streamer's.
   */
  private async pickAndReply(
    since: number,
    about: readonly RoomLine[],
    picker: AskClaude,
    reply: (target: UnpromptedReply) => void,
  ): Promise<void> {
    const { room, log, pickTemplate, streamer: findStreamer } = this.options;
    if (!pickTemplate) return;
    const streamer = findStreamer?.() ?? null;
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
    const pick = parseReplyPick(answer);
    if (!pick) {
      log.warn('reply pick is not json', { answer });
      return;
    }
    const targets = new Map<string, UnpromptedReply>();
    for (const n of pick.lines) {
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
      // One answer each, to what they said last.
      if (target) targets.set(target.userId, target);
    }
    const picked = [...targets.values()].slice(0, MAX_PICKS);
    log.info('picked whom to answer', {
      picked: picked.map(({ nickname, question }) => ({ nickname, question })),
    });
    for (const target of picked) reply(target);
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

  private async say(kind: OutgoingMessage['kind'], why: string): Promise<string | null> {
    const { ask, outbox, room, log, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    try {
      const prompt = buildPrompt(this.options.promptTemplate(), {
        ...room.promptInput(),
        question: why,
        singleLength: maxLength,
        maxLength,
      });
      log.debug('talk prompt', { prompt });
      const image = await room.screenshot();
      // An answer that isn't TALK_ANSWER_SCHEMA's shape is taken as the message.
      const raw = await ask({ prompt, image, schema: TALK_ANSWER_SCHEMA });
      const answer = parseTalkAnswer(raw) ?? { reply: true, message: raw };
      if (!answer.reply) {
        log.info('no need to talk', { why });
        return null;
      }
      const text = plainMessage(answer.message, maxLength);
      if (!text) {
        log.warn('claude had nothing to say');
        return null;
      }
      log.info('talking', { text, kind });
      outbox.push({ kind, text });
      return text;
    } catch (err) {
      log.error('could not talk', { error: errorMessage(err) });
      return null;
    }
  }
}

/** Why it talks when someone talked about it (auto-reply.md says what to do then). */
function followUp(line: RoomLine): string {
  return `有人说到你：${line.who} 说「${line.text}」。`;
}
