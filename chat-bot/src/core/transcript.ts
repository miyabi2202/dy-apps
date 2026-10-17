/** One sentence the streamer said, as the transcription worker heard it. */
export interface TranscriptLine {
  /** When it started and ended, in ms since the epoch. */
  start: number;
  end: number;
  text: string;
  /** How much it sounds like speech and like music, 0–1; a song, sung or played, scores high on music. */
  speech?: number;
  music?: number;
}

/**
 * Below this speech score a line is taken as sung. On a singing stream, sung lines scored at most
 * 0.12 and talk at least 0.36; the music score can't tell them apart, since talk over backing
 * music scores 0.6–0.7 on it too.
 */
const SUNG_BELOW_SPEECH = 0.2;

/** Whether the streamer sang the line rather than said it; unknown without a speech score. */
export function isSung(line: TranscriptLine): boolean {
  return line.speech !== undefined && line.speech < SUNG_BELOW_SPEECH;
}

/** A line the transcription worker prints: one sentence, times in seconds. */
interface WorkerLine {
  start: number;
  end: number;
  text: string;
  speech?: number;
  music?: number;
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
    ...(typeof line.speech === 'number' && { speech: line.speech }),
    ...(typeof line.music === 'number' && { music: line.music }),
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
