import { errorMessage } from '../core/errors';
import { parseJsonObject } from '../core/json-answer';
import { buildPrompt } from '../core/prompt';
import { DOUYIN_CHAT_LIMIT } from '../core/reply';
import type { IncomingChat } from '../core/room-events';
import { done, failed, type Command } from './command';
import type { Outbox } from './outbox';
import type { AskClaude, Judge, Log } from './ports';
import type { RoomState } from './room-state';

export interface MaliceWatchOptions {
  /** Jev: scores each chat on its own, so only a few go on to the model. */
  judge: Judge;
  /** The model that decides, with the room's chat around it (Codex). */
  ask: AskClaude;
  /** The model's prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  outbox: Pick<Outbox, 'push'>;
  room: Pick<RoomState, 'promptInput'>;
  /** Viewers never judged: the streamer and the bot's admins. */
  exempt?: (userId: string) => boolean;
  log: Log;
  /** Whether it starts on (off by default); `/识别恶意言论` switches it. */
  on?: boolean;
  /** Jev's score from which a chat goes on to the model. */
  threshold?: number;
  /** How much chat around it the model sees. */
  contextMs?: number;
  /** At most this many chats with the model at once; more are let go. */
  maxPending?: number;
}

/** What Jev is asked of each chat. Written for the puns and innuendo it otherwise scores low. */
export const MALICE_QUESTION =
  '这条弹幕是不是在恶意贬低主播或观众：骂人、攻击外貌身材年龄（包括用谐音字、错别字、拼音缩写来绕开屏蔽的说法）、或者性暗示（暗指她私生活乱、陪睡、卖身、有金主、靠男人捞钱这类，配了爱心笑脸表情、装作夸人也算）？朋友间的玩笑、吐槽唱得不好、正常提问都不算。';

const MALICE_SCHEMA = {
  type: 'object',
  properties: { malicious: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['malicious', 'reason'],
  additionalProperties: false,
};

/** What the bot says to someone it found malicious, after their @. */
const WARNING = '检测到恶意言论';

/**
 * Watches the chat for malicious messages (insults, sexual innuendo, attacks on looks or age),
 * caring most about never flagging an ordinary viewer. Jev scores every chat on its own with
 * MALICE_QUESTION; one scoring `threshold` or more goes to the model with the chat and the
 * streamer's speech around it, told to say no when unsure. Each chat the model finds malicious
 * has its sender @ed with WARNING. On 2000 chats from friendly rooms, Jev let 4% through and the
 * model flagged one, a regular teasing.
 */
export class MaliceWatch {
  on: boolean;
  private pending = 0;

  constructor(private readonly options: MaliceWatchOptions) {
    this.on = options.on ?? false;
  }

  /** Called with each chat from someone but the bot, once it's in the room's history. */
  hear(chat: IncomingChat): void {
    const { userId } = chat;
    if (!this.on || !userId || this.options.exempt?.(userId) || !chat.content.trim()) return;
    void this.check({ ...chat, userId });
  }

  /** `/识别恶意言论 1` turns it on, `/识别恶意言论 0` off. */
  commands(): Command[] {
    return [
      {
        name: '识别恶意言论',
        adminOnly: true,
        price: 0,
        run: (args) => {
          if (args !== '0' && args !== '1') {
            return failed('要写 0（关闭）或 1（打开），用法：/识别恶意言论 1');
          }
          this.on = args === '1';
          this.options.log.info('malice watch', { on: this.on });
          return done('已处理识别恶意言论请求');
        },
      },
    ];
  }

  private async check(chat: IncomingChat & { userId: string }): Promise<void> {
    const { judge, log, threshold = 0.5, maxPending = 3 } = this.options;
    try {
      const scores = await judge(`抖音直播间弹幕：${chat.content}`, { malice: MALICE_QUESTION });
      const score = scores.malice ?? 0;
      if (score < threshold) return;
      if (this.pending >= maxPending) {
        log.warn('malice watch busy, letting a chat go', { text: chat.content, score });
        return;
      }
      this.pending++;
      try {
        const verdict = await this.decide(chat);
        log.info('malice judged', { who: chat.nickname, text: chat.content, score, ...verdict });
        if (verdict.malicious) this.warn(chat);
      } finally {
        this.pending--;
      }
    } catch (err) {
      log.warn('could not check for malice', { text: chat.content, error: errorMessage(err) });
    }
  }

  private async decide(chat: IncomingChat): Promise<{ malicious: boolean; reason: string }> {
    const { ask, room, contextMs = 90_000 } = this.options;
    const input = room.promptInput();
    // What came before the chat is its background; more may have come in while Jev scored it.
    const before = input.history.filter(
      (line) =>
        line.ts <= chat.ts &&
        !(line.ts === chat.ts && line.userId === chat.userId && line.content === chat.content),
    );
    const prompt = buildPrompt(this.options.promptTemplate(), {
      ...input,
      history: before.filter((line) => chat.ts - line.ts <= contextMs),
      transcript: input.transcript.filter(
        (line) => line.end <= chat.ts && chat.ts - line.end <= contextMs,
      ),
      asker: chat.nickname,
      question: chat.content,
      userChat: before
        .filter((line) => line.userId === chat.userId && chat.ts - line.ts <= 5 * 60_000)
        .map((line) => line.content)
        .join('\n'),
      singleLength: DOUYIN_CHAT_LIMIT,
      maxLength: DOUYIN_CHAT_LIMIT,
    });
    const answer = parseJsonObject((await ask({ prompt, schema: MALICE_SCHEMA })).trim());
    // An answer that isn't the schema's is taken as no: better to miss one than flag someone.
    return {
      malicious: answer?.malicious === true,
      reason: typeof answer?.reason === 'string' ? answer.reason : '',
    };
  }

  private warn({ userId, nickname }: IncomingChat & { userId: string }): void {
    const { outbox, log } = this.options;
    log.info('malice warned', { nickname, userId });
    outbox.push({ kind: 'reply', text: `@${nickname} ${WARNING}` });
  }
}
