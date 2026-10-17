/** One sentence the streamer said, as the transcription worker heard it. */
export interface TranscriptLine {
  /** When it started and ended, in ms since the epoch. */
  start: number;
  end: number;
  text: string;
  /** Background music was playing (often true under speech too, so only a hint). */
  bgm: boolean;
  /** SenseVoice's guess, like `HAPPY` or `NEUTRAL`. */
  emotion: string | null;
  /** How much it sounds like speech and like singing, 0–1; a background song scores high on singing. */
  speech?: number;
  singing?: number;
}

/** A line the transcription worker prints: one sentence, times in seconds. */
interface WorkerLine {
  start: number;
  end: number;
  text: string;
  bgm?: boolean;
  emotion?: string | null;
  speech?: number;
  singing?: number;
}

/** A line of the worker's output as a TranscriptLine, or null when it isn't a sentence. */
export function parseWorkerLine(text: string): TranscriptLine | null {
  let line: WorkerLine;
  try {
    line = JSON.parse(text) as WorkerLine;
  } catch {
    return null;
  }
  if (typeof line.text !== 'string' || !line.text) return null;
  return {
    start: line.start * 1000,
    end: line.end * 1000,
    text: line.text,
    bgm: line.bgm === true,
    emotion: line.emotion ?? null,
    ...(typeof line.speech === 'number' && { speech: line.speech }),
    ...(typeof line.singing === 'number' && { singing: line.singing }),
  };
}

/** What the streamer said lately, oldest first. Lines older than `keepMs` are forgotten. */
export class Transcript {
  private lines: TranscriptLine[] = [];

  constructor(
    private readonly keepMs = 30 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  add(line: TranscriptLine): void {
    this.lines.push(line);
    const cutoff = this.now() - this.keepMs;
    const firstKept = this.lines.findIndex((l) => l.end >= cutoff);
    if (firstKept > 0) this.lines = this.lines.slice(firstKept);
  }

  /** Lines that ended within the last `ms`. */
  recent(ms: number): TranscriptLine[] {
    const cutoff = this.now() - ms;
    return this.lines.filter((l) => l.end >= cutoff);
  }
}
