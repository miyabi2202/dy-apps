import { errorMessage } from '../core/errors';
import { MALICE_SCHEMA, parseMaliceAnswer, type MaliceAnswer } from '../core/malice-answer';
import { DOUYIN_CHAT_LIMIT } from '../core/reply';
import type { IncomingChat } from '../core/room-events';
import { askJson } from './ask-json';
import { done, failed, type Command } from './command';
import { ModelFeature } from './model-feature';
import type { Outbox } from './outbox';
import { Pending } from './pending';
import type { AskModel, Judge, Log, SettingsStore } from './ports';
import { setting } from './setting';
import type { RoomState } from './room-state';

export interface MaliceWatchOptions {
  /** Jev: scores each chat on its own, so only a few go on to the model. */
  judge: Judge;
  /** The model that decides, with the room's chat around it (Codex). */
  ask: AskModel;
  /** The model's prompt (see buildPrompt), read each time so edits apply at once. */
  promptTemplate: () => string;
  outbox: Pick<Outbox, 'push'>;
  room: Pick<RoomState, 'prompt' | 'recentChat' | 'recentTranscript' | 'wording' | 'atName'>;
  /** Viewers never judged: the streamer and the bot's admins. */
  exempt?: (userId: string) => boolean;
  log: Log;
  /** Whether it starts on (off by default); `/识别恶意言论` switches it. Without `settings`, what it starts as. */
  on?: boolean;
  /** The room's settings, where it's kept (`maliceWatch`). */
  settings?: SettingsStore;
  /** Jev's score from which a chat goes on to the model. */
  threshold?: number;
  /** How much chat around it the model sees. */
  contextMs?: number;
  /** At most this many chats with the model at once; more are let go. */
  maxPending?: number;
}

/** A chat from someone, with a user id. */
type Heard = IncomingChat & { userId: string };

/** A chat Jev scored `score` for the model to decide on. */
interface Suspect {
  chat: Heard;
  score: number;
}

/** What the bot says to someone it found malicious, after their @. */
const WARNING = '检测到恶意言论';

/**
 * Watches the chat for malicious messages (insults, sexual innuendo, attacks on looks or age),
 * caring most about never flagging an ordinary viewer. Jev scores every chat on its own with
 * the wording's `malice-question`; one scoring `threshold` or more goes to the model with the chat and the
 * streamer's speech around it, told to say no when unsure. Each chat the model finds malicious
 * has its sender @ed with WARNING. On 2000 chats from friendly rooms, Jev let 4% through and the
 * model flagged one, a regular teasing.
 */
export class MaliceWatch extends ModelFeature<Suspect, MaliceAnswer> {
  private readonly onSetting: ReturnType<typeof setting<'maliceWatch'>>;
  private pending = 0;
  private readonly work = new Pending();

  constructor(private readonly options: MaliceWatchOptions) {
    super(options.log);
    this.onSetting = setting(options.settings, 'maliceWatch', options.on ?? false);
  }

  /** Whether it watches; admins switch it while the bot runs. */
  get on(): boolean {
    return this.onSetting.get();
  }

  set on(on: boolean) {
    this.onSetting.set(on);
  }

  /** Called with each chat from someone but the bot, once it's in the room's history. */
  hear(chat: IncomingChat): void {
    const { userId } = chat;
    if (!this.on || !userId || this.options.exempt?.(userId) || !chat.content.trim()) return;
    this.work.track(this.check({ ...chat, userId }));
  }

  /** Resolves once every chat heard so far has been checked. */
  idle(): Promise<void> {
    return this.work.idle();
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

  private async check(chat: Heard): Promise<void> {
    const { judge, log, threshold = 0.5, maxPending = 3 } = this.options;
    let score: number;
    try {
      const scores = await judge(`抖音直播间弹幕：${chat.content}`, {
        malice: this.options.room.wording('malice-question'),
      });
      score = scores.malice ?? 0;
    } catch (err) {
      this.couldNotCheck(chat, err);
      return;
    }
    if (score < threshold) return;
    if (this.pending >= maxPending) {
      log.warn('malice watch busy, letting a chat go', { text: chat.content, score });
      return;
    }
    this.pending++;
    try {
      await this.run({ chat, score });
    } finally {
      this.pending--;
    }
  }

  protected buildPrompt({ chat }: Suspect): string {
    const { room, contextMs = 90_000 } = this.options;
    // What came before the chat is its background; more may have come in while Jev scored it.
    const before = room
      .recentChat()
      .filter(
        (line) =>
          line.ts <= chat.ts &&
          !(line.ts === chat.ts && line.userId === chat.userId && line.content === chat.content),
      );
    return room.prompt(this.options.promptTemplate(), {
      history: before.filter((line) => chat.ts - line.ts <= contextMs),
      transcript: room
        .recentTranscript()
        .filter((line) => line.end <= chat.ts && chat.ts - line.end <= contextMs),
      asker: chat.nickname,
      question: chat.content,
      userChat: before
        .filter((line) => line.userId === chat.userId && chat.ts - line.ts <= 5 * 60_000)
        .map((line) => line.content)
        .join('\n'),
      singleLength: DOUYIN_CHAT_LIMIT,
      maxLength: DOUYIN_CHAT_LIMIT,
    });
  }

  protected async ask(_suspect: Suspect, prompt: string): Promise<MaliceAnswer> {
    const { value } = await askJson(
      this.options.ask,
      { prompt },
      { schema: MALICE_SCHEMA, parse: parseMaliceAnswer, notJson: 'malice answer is not json' },
      this.options.log,
    );
    // parseMaliceAnswer takes an answer that isn't the schema's as no, so there's always a value.
    return value ?? { malicious: false, reason: '' };
  }

  protected deliver({ chat, score }: Suspect, verdict: MaliceAnswer): void {
    this.options.log.info('malice judged', {
      who: chat.nickname,
      text: chat.content,
      score,
      ...verdict,
    });
    if (verdict.malicious) this.warn(chat);
  }

  protected failed({ chat }: Suspect, err: unknown): void {
    this.couldNotCheck(chat, err);
  }

  private couldNotCheck(chat: Heard, err: unknown): void {
    this.options.log.warn('could not check for malice', {
      text: chat.content,
      error: errorMessage(err),
    });
  }

  private warn({ userId, nickname }: Heard): void {
    const { outbox, log } = this.options;
    log.info('malice warned', { nickname, userId });
    outbox.push({ kind: 'reply', text: `@${this.options.room.atName(nickname)} ${WARNING}` });
  }
}
