import { errorMessage } from '../../core/errors';
import { parseJsonObject } from '../../core/replies/json-answer';
import { DOUYIN_CHAT_LIMIT, plainMessages } from '../../core/replies/reply';
import { fillTemplate } from '../../core/prompts/template';
import { askJson } from '../models/ask-json';
import { ModelFeature } from '../models/model-feature';
import type { AskModel, Log, SettingsStore } from '../ports';
import type { RoomState } from '../room/room-state';
import type { Outbox } from './outbox';

/** How a thought's score is turned into the one that decides whether it's said. */
export interface ThoughtScoring {
  /** Taken off a thought on the same topic as one of the last round's. */
  sameTopicPenalty: number;
  /** Added for each whole minute since anyone but the bot chatted… */
  quietBonusPerMinute: number;
  /** …up to this much. */
  maxQuietBonus: number;
  /** The final score from which the best thought is said. */
  minScore: number;
}

export const DEFAULT_SCORING: ThoughtScoring = {
  sameTopicPenalty: 0.2,
  quietBonusPerMinute: 0.025,
  maxQuietBonus: 0.3,
  minScore: 0.6,
};

export interface ProactiveTalkOptions {
  /** Claude. */
  ask: AskModel;
  outbox: Pick<Outbox, 'push'>;
  /** The prompt (proactive-talk.md), read each time so edits apply at once. */
  promptTemplate: () => string;
  room: Pick<RoomState, 'now' | 'prompt' | 'replyLimits'>;
  log: Log;
  /** Where the interval is kept (the room's room_config.json): `proactiveTalkMinutes`, 0 off. */
  settings: SettingsStore;
  scoring?: Partial<ThoughtScoring>;
  /** Douyin's chat length limit. */
  maxLength?: number;
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks whether it's time, so a change to the interval applies soon. */
  tickMs?: number;
}

/** One thing that crossed the bot's mind, as Claude gave it. */
export interface Thought {
  thought: string;
  /** How much it wants to say it, 0 to 1. */
  score: number;
  /** On the same topic as one of the last round's thoughts. */
  sameTopic: boolean;
  /** The line it would send. */
  say: string;
}

const THOUGHTS_SCHEMA = {
  type: 'object',
  properties: {
    thoughts: {
      type: 'array',
      description: '此刻心里冒出来的念头，3 到 5 个',
      items: {
        type: 'object',
        properties: {
          thought: { type: 'string', description: '心里的念头' },
          score: { type: 'number', description: '有多想、多值得说出来，0 到 1' },
          sameTopic: { type: 'boolean', description: '是不是和你上一轮的某个念头是同一个话题' },
          say: { type: 'string', description: '真要说时发到直播间的那一句' },
        },
        required: ['thought', 'score', 'sameTopic', 'say'],
        additionalProperties: false,
      },
    },
  },
  required: ['thoughts'],
  additionalProperties: false,
} as const;

function parseThoughts(text: string): Thought[] | null {
  const thoughts = parseJsonObject(text)?.thoughts;
  if (!Array.isArray(thoughts)) return null;
  return (thoughts as unknown[]).filter(isThought);
}

function isThought(value: unknown): value is Thought {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.thought === 'string' &&
    typeof t.score === 'number' &&
    typeof t.sameTopic === 'boolean' &&
    typeof t.say === 'string'
  );
}

/** What a thought's score comes to: its own, less the same-topic penalty, plus the quiet bonus, kept within 0 to 1. */
export function finalScore(
  { score, sameTopic }: Pick<Thought, 'score' | 'sameTopic'>,
  quietMinutes: number,
  scoring: ThoughtScoring = DEFAULT_SCORING,
): number {
  const bonus = Math.min(
    scoring.maxQuietBonus,
    Math.floor(quietMinutes) * scoring.quietBonusPerMinute,
  );
  const total = score - (sameTopic ? scoring.sameTopicPenalty : 0) + bonus;
  return Math.round(Math.min(1, Math.max(0, total)) * 1000) / 1000;
}

/** What Claude thought, as of when the room had been quiet `quietMinutes`. */
interface Thinking {
  thoughts: Thought[];
  quietMinutes: number;
}

/**
 * Every `proactiveTalkMinutes` (`/主动说话`; 0 off), has Claude think in the room's persona: a few
 * thoughts on the room as it is now (what the streamer said, the chat, what the bot said lately,
 * its memories), each scored from 0 to 1 for how much it wants to say it, and marked when it's on
 * the same topic as one of the last round's thoughts (said or not). The program then takes
 * `sameTopicPenalty` off those, adds `quietBonusPerMinute` for each minute no one but the bot has
 * chatted (up to `maxQuietBonus`), and says the best only from `minScore`; otherwise the bot keeps
 * quiet. The first look is one interval after it's turned on (or the bot starts with it on), and
 * the next one interval after Claude answered.
 */
export class ProactiveTalk extends ModelFeature<number, Thinking> {
  private readonly scoring: ThoughtScoring;
  private stopped = false;
  /** When it last thought, or was turned on; undefined while off. */
  private since: number | undefined;
  /** When someone but the bot last chatted, or it started. */
  private lastChat: number | undefined;
  /** The last round's thoughts, a line each, the one said marked; undefined before the first. */
  private lastThoughts: string | undefined;
  private asking = false;

  constructor(private readonly options: ProactiveTalkOptions) {
    super(options.log);
    this.scoring = { ...DEFAULT_SCORING, ...options.scoring };
  }

  /** Runs until `stop()`. */
  async loop(): Promise<void> {
    const { sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), tickMs = 10_000 } =
      this.options;
    this.lastChat ??= this.options.room.now();
    while (!this.stopped) {
      void this.tick();
      await sleep(tickMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /** Someone but the bot chatted. */
  heardChat(): void {
    this.lastChat = this.options.room.now();
  }

  /** Thinks if it's time; resolves once it has (at once when it isn't time). */
  async tick(): Promise<void> {
    const { room, settings } = this.options;
    const minutes = settings.get().proactiveTalkMinutes;
    if (!minutes) {
      this.since = undefined;
      return;
    }
    const at = room.now();
    this.lastChat ??= at;
    if (this.since === undefined) {
      this.since = at;
      return;
    }
    if (this.asking || at - this.since < minutes * 60_000) return;
    this.asking = true;
    try {
      await this.run((at - this.lastChat) / 60_000);
    } finally {
      // Counted from when Claude answered, so a slow answer doesn't make the next one come at once.
      this.since = room.now();
      this.asking = false;
    }
  }

  protected buildPrompt(): string {
    const { room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    const template = fillTemplate(this.options.promptTemplate(), {
      lastThoughts: this.lastThoughts ?? '（这是这次开播第一次想，没有上一轮）',
    });
    return room.prompt(template, { singleLength: maxLength, maxLength });
  }

  protected async ask(quietMinutes: number, prompt: string): Promise<Thinking | undefined> {
    const { value } = await askJson(
      this.options.ask,
      { prompt },
      { schema: THOUGHTS_SCHEMA, parse: parseThoughts, notJson: 'proactive thoughts are not json' },
      this.options.log,
    );
    return value ? { thoughts: value, quietMinutes } : undefined;
  }

  protected deliver(_: number, { thoughts, quietMinutes }: Thinking): void {
    const { outbox, log, room, maxLength = DOUYIN_CHAT_LIMIT } = this.options;
    const scored = thoughts.map((t) => ({
      ...t,
      final: finalScore(t, quietMinutes, this.scoring),
    }));
    log.info('proactive thoughts', {
      quietMinutes: Math.floor(quietMinutes),
      thoughts: scored.map(({ thought, score, sameTopic, final }) => ({
        thought,
        score,
        sameTopic,
        final,
      })),
    });
    const best = scored
      .filter((t) => t.say.trim())
      .reduce<(typeof scored)[number] | undefined>(
        (top, t) => (top && top.final >= t.final ? top : t),
        undefined,
      );
    const said = best && best.final >= this.scoring.minScore ? best : undefined;
    this.lastThoughts = scored
      .map((t) => `- ${t.thought}${t === said ? `（说出去了：${t.say}）` : ''}`)
      .join('\n');
    if (!said) {
      log.info('proactive talk: nothing worth saying', {
        best: best?.final ?? null,
        minScore: this.scoring.minScore,
      });
      return;
    }
    log.info('proactive talk', { text: said.say, final: said.final });
    // One message: what doesn't fit is cut, not sent as more.
    for (const text of plainMessages(said.say, { ...room.replyLimits(maxLength), maxParts: 1 })) {
      outbox.push({ kind: 'talk', text });
    }
  }

  protected failed(_: number, err: unknown): void {
    this.options.log.warn('could not think of something to say', { error: errorMessage(err) });
  }
}
