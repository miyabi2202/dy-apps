import { errorMessage } from '../../core/errors';
import { lifeLines, lifeText } from '../../core/prompts/life';
import { localDate } from '../../core/prompts/local-time';
import { parseJsonObject } from '../../core/replies/json-answer';
import { fillTemplate } from '../../core/prompts/template';
import { askJson } from '../models/ask-json';
import { ModelFeature } from '../models/model-feature';
import type { AskModel, LifeLog, Log } from '../ports';

export interface LifeWriterOptions {
  /** Claude. */
  ask: AskModel;
  /** The prompt (life.md), read each time so edits apply at once. */
  promptTemplate: () => string;
  life: LifeLog;
  /** The shared persona the room plays now (its persona file's `base`); none for no life. */
  persona: () => string | undefined;
  /** That shared persona's text, as it is in chat-bot/prompts/personas/<persona>/persona.md. */
  personaText: (persona: string) => string;
  /**
   * Who the persona is in her world and how her days are written (chat-bot/prompts/personas/<persona>/life.md); null
   * when there's none, and then she has no days of her own.
   */
  guide: (persona: string) => string | null;
  /** The room's time zone, which says what day it is. */
  timeZone: () => string | undefined;
  log: Log;
  /** How many of her latest days the prompt shows, so today follows on from them. */
  days?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How often it looks whether today is written yet. */
  tickMs?: number;
}

/** A day to write: whose, and which. */
interface Day {
  persona: string;
  guide: string;
  /** `YYYY-MM-DD 星期X`. */
  today: string;
}

const LIFE_SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: { type: 'string', description: '今天的一件事，一到两句话' },
      description: '她今天的 2 到 3 件事',
    },
  },
  required: ['entries'],
  additionalProperties: false,
} as const;

function parseEntries(text: string): string[] | null {
  const entries = parseJsonObject(text)?.entries;
  return Array.isArray(entries) && entries.every((entry) => typeof entry === 'string')
    ? entries
    : null;
}

/**
 * Gives the room's persona a life of her own: once a day (in the room's time zone), when the
 * shared persona it plays has a life.md in her folder in chat-bot/prompts/personas/, Claude writes what happened to
 * her today from that guide and her latest days, and it's kept in the life log for every room that
 * plays her (livePersona shows the latest days at the end of the persona). Looks when it starts and
 * every `tickMs`; a day another room's bot wrote first is kept, and a failed one is tried again.
 */
export class LifeWriter extends ModelFeature<Day, string[]> {
  private stopped = false;
  private asking = false;

  constructor(private readonly options: LifeWriterOptions) {
    super(options.log);
  }

  /** Runs until `stop()`. */
  async loop(): Promise<void> {
    const {
      sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      tickMs = 10 * 60_000,
    } = this.options;
    while (!this.stopped) {
      void this.tick();
      await sleep(tickMs);
    }
  }

  stop(): void {
    this.stopped = true;
  }

  /** Writes today if it isn't yet; resolves once it's done (at once when there's nothing to do). */
  async tick(): Promise<void> {
    const { persona: current, guide, life, timeZone, now = Date.now } = this.options;
    const persona = current();
    if (!persona || this.asking) return;
    const text = guide(persona);
    if (text === null) return;
    const today = localDate(now(), timeZone());
    if (life.has(persona, today.slice(0, 10))) return;
    this.asking = true;
    try {
      await this.run({ persona, guide: text, today });
    } finally {
      this.asking = false;
    }
  }

  protected buildPrompt({ persona, guide, today }: Day): string {
    const { life, personaText, days = 14 } = this.options;
    return fillTemplate(this.options.promptTemplate(), {
      persona: personaText(persona).trim(),
      guide: guide.trim(),
      recentLife: lifeText(life.recent(persona, days)) || '（还没有）',
      today,
    });
  }

  protected async ask({ persona }: Day, prompt: string): Promise<string[] | undefined> {
    const { value } = await askJson(
      this.options.ask,
      { prompt, tools: [], why: `life of ${persona}` },
      { schema: LIFE_SCHEMA, parse: parseEntries, notJson: 'life answer is not json' },
      this.options.log,
    );
    return value ?? undefined;
  }

  protected deliver({ persona, today }: Day, entries: string[]): void {
    const { life, log } = this.options;
    const date = today.slice(0, 10);
    const text = lifeLines(entries);
    if (!text) {
      log.warn('life: Claude wrote nothing for today', { persona, date });
      return;
    }
    if (life.add(persona, date, text)) log.info('life: wrote today', { persona, date, text });
    else log.info('life: today was already written', { persona, date });
  }

  protected failed({ persona }: Day, err: unknown): void {
    this.options.log.warn("could not write the persona's day", {
      persona,
      error: errorMessage(err),
    });
  }
}
