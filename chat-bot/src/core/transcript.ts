/** How far back the prompts' `{{transcript}}` goes unless set otherwise. */
export const DEFAULT_TRANSCRIPT_WINDOW_MS = 5 * 60_000;

/** One sentence the streamer said, as the transcription worker heard it. */
export interface TranscriptLine {
  /** When it started and ended, in ms since the epoch. */
  start: number;
  end: number;
  text: string;
  /** The language it was heard as ("zh", "en", "ja", …), which picked the recognizer. */
  lang?: string;
  /** How much it sounds like speech and like music, 0–1; a song, sung or played, scores high on music. */
  speech?: number;
  music?: number;
  /**
   * Which voice said it, numbered as heard (voices heard singing are told apart from those heard
   * talking); unknown for a sentence too short.
   */
  speaker?: number;
  /** Whether that voice is the streamer's rather than someone they're linked up with (连线). */
  host?: boolean;
  /** How close its voiceprint was to that voice's, 0–1; unknown for a voice heard first. */
  voice?: number;
}

/** Whether someone the streamer is linked up with (连线) said it, as far as voices tell. */
export function isGuest(line: TranscriptLine): boolean {
  return line.host === false;
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

/**
 * What was said and sung since the current song started: a pause of more than `gapMs` between
 * two sung lines ends a song, so everything before the last such pause belongs to an earlier one.
 * All of `lines` when nothing was sung.
 */
export function currentSong(lines: readonly TranscriptLine[], gapMs = 60_000): TranscriptLine[] {
  const sung = lines.filter(isSung);
  let start = sung[0]?.start;
  for (let i = sung.length - 1; i > 0; i--) {
    const [before, after] = [sung[i - 1], sung[i]];
    if (before && after && after.start - before.end > gapMs) {
      start = after.start;
      break;
    }
  }
  return start === undefined ? [...lines] : lines.filter((line) => line.start >= start);
}

/**
 * Whether the streamer is singing at `at`: of their lines (not a linked-up guest's) that ended in
 * the minute before, at least 3 were sung and they're at least 70% of them. On a singing stream
 * that was 75–100% a minute of singing, and at most 40% (60% once) one of talk, where a line now
 * and then is taken for sung.
 */
export function singingNow(lines: readonly TranscriptLine[], at: number): boolean {
  const lately = lines.filter((line) => !isGuest(line) && at - line.end < 60_000 && line.end <= at);
  const sung = lately.filter(isSung).length;
  return sung >= 3 && sung >= 0.7 * lately.length;
}

/** The song being sung as `line` comes in, and when it started. */
export interface SungSong {
  /** What the streamer said and sang since it started (not a linked-up guest's lines). */
  lines: TranscriptLine[];
  /** When its first sung line started. */
  start: number;
}

/**
 * The song the streamer is singing as of `line`, a line they just said or sang (`transcript`
 * already has it): null when `line` is spoken or a guest's, or they aren't singing (see
 * singingNow).
 */
export function singingSong(
  transcript: readonly TranscriptLine[],
  line: TranscriptLine,
): SungSong | null {
  if (!isSung(line) || isGuest(line)) return null;
  const lines = transcript.filter((l) => !isGuest(l));
  if (!singingNow(lines, line.end)) return null;
  const song = currentSong(lines);
  return { lines: song, start: song.find(isSung)?.start ?? line.start };
}

/**
 * Whether `song` was already dealt with at `handledAt` (when the last one was named, rolled for…):
 * a new song starts after a pause, and the same one counts again after `againMs` of singing on.
 * The song's start can't just be compared with that: it moves as its first lines drop out of the
 * transcript.
 */
export function isHandled(
  song: SungSong,
  handledAt: number,
  now: number,
  againMs: number,
): boolean {
  return song.start <= handledAt && now - handledAt < againMs;
}

/** A line the transcription worker prints: one sentence, times in seconds. */
interface WorkerLine {
  start: number;
  end: number;
  text: string;
  lang?: string | null;
  speech?: number;
  music?: number;
  speaker?: number | null;
  host?: boolean | null;
  voice?: number | null;
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
    ...(typeof line.lang === 'string' && { lang: line.lang }),
    ...(typeof line.speech === 'number' && { speech: line.speech }),
    ...(typeof line.music === 'number' && { music: line.music }),
    ...(typeof line.speaker === 'number' && { speaker: line.speaker }),
    ...(typeof line.host === 'boolean' && { host: line.host }),
    ...(typeof line.voice === 'number' && { voice: line.voice }),
  };
}

/**
 * The worker's `{"ready": true}` (models loaded), `{"stream_ended": true, …}` or `{"busy": true}`
 * (the speech service is serving another bot), or null.
 */
export function parseStatusLine(text: string): 'ready' | 'stream_ended' | 'busy' | null {
  if (!text.startsWith('{')) return null;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json.ready === true) return 'ready';
    if (json.stream_ended === true) return 'stream_ended';
    if (json.busy === true) return 'busy';
  } catch {
    // Not JSON: not a status.
  }
  return null;
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
