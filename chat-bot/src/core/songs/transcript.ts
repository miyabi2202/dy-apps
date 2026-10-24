import type { MusicMatch } from './music';
import { isOneSong, lastBreak, type SongSpan } from './song-breaks';

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
  /**
   * The recording playing when it was sung, as Shazam found it: a song played to the room, not
   * sung by anyone there (see the worker's Recordings).
   */
  played?: MusicMatch;
}

/**
 * Whether someone other than the streamer said or sang it (连线, or a recording's singer), as far
 * as voices tell: sung lines are told apart among the voices heard singing, the streamer's being
 * the one heard most. A line too short for a voiceprint is the streamer's.
 */
export function isGuest(line: TranscriptLine): boolean {
  return line.host === false;
}

/**
 * Whether it's someone else talking: what song naming leaves out. Sung lines count whoever sang
 * them, as the voices can't tell the streamer singing in another language or style from someone
 * else (see othersShare).
 */
export function isGuestTalk(line: TranscriptLine): boolean {
  return isGuest(line) && !isSung(line);
}

/**
 * Below this speech score a line is taken as sung. On a singing stream, sung lines scored at most
 * 0.12 and talk at least 0.36; the music score can't tell them apart, since talk over backing
 * music scores 0.6–0.7 on it too.
 */
const SUNG_BELOW_SPEECH = 0.2;

/**
 * Whether the streamer (or a guest) sang the line rather than said it; unknown without a speech
 * score. A recording playing isn't sung (see isPlayed).
 */
export function isSung(line: TranscriptLine): boolean {
  return !isPlayed(line) && line.speech !== undefined && line.speech < SUNG_BELOW_SPEECH;
}

/** Whether the streamer sang it herself: sung, and neither a guest's (see isGuest) nor a recording. */
export function isStreamerSinging(line: TranscriptLine): boolean {
  return isSung(line) && !isGuest(line);
}

/** Whether the line is a recording playing: neither sung nor said by anyone in the room. */
export function isPlayed(line: TranscriptLine): boolean {
  return line.played !== undefined;
}

/** Where one song ends and the next begins, see currentSong. */
export interface SongBreaks {
  /** A pause longer than this between two sung lines (from the end of one to the end of the next). */
  pauseMs?: number;
  /** A shorter pause, longer than this, in which the streamer said at least `talkLines` lines. */
  talkPauseMs?: number;
  talkLines?: number;
  /** What the song break sources say, combined (see combineSpans); none, only pauses and talk. */
  spans?: readonly SongSpan[];
}

/**
 * What was said and sung since the current song started: a song ends at a pause of more than
 * `pauseMs` between two sung lines, or of more than `talkPauseMs` in which the streamer talked
 * (`talkLines` lines or more, a guest's not counted), so everything before the last such pause
 * belongs to an earlier one. On 88 songs named in a row in three rooms, a pause of a minute alone
 * ran 15 pairs of songs together; with the talk too, 5 (sung straight on, no pause or talk), and
 * split 5 songs in two (talk over the backing track) against 4. All of `lines` when nothing was
 * sung.
 *
 * The song break sources' `spans` (see song-breaks.ts) rank above the pauses and talk: a pause
 * inside one of their `same` spans is no break, and a song also starts at their last break.
 */
export function currentSong(
  lines: readonly TranscriptLine[],
  { pauseMs = 60_000, talkPauseMs = 15_000, talkLines = 2, spans = [] }: SongBreaks = {},
): TranscriptLine[] {
  let start = lastBreak(spans)?.from;
  let lastSung: number | undefined;
  let talk = 0;
  for (const line of lines) {
    if (isPlayed(line)) continue;
    if (!isSung(line)) {
      if (!isGuestTalk(line)) talk++;
      continue;
    }
    const pause = lastSung === undefined ? Infinity : line.end - lastSung;
    const paused = pause > pauseMs || (pause > talkPauseMs && talk >= talkLines);
    if (paused && !isOneSong(spans, line.start) && (start === undefined || line.start > start)) {
      start = line.start;
    }
    lastSung = line.end;
    talk = 0;
  }
  return start === undefined ? [...lines] : lines.filter((line) => line.start >= start);
}

/**
 * How much of what was sung in `lines` another voice sang (see isGuest), 0–1 by characters; 0
 * when nothing was sung.
 */
export function othersShare(lines: readonly TranscriptLine[]): number {
  const sung = sungChars(lines);
  return sung ? sungChars(lines.filter(isGuest)) / sung : 0;
}

/** How much was sung in `lines`: the characters of their sung lines, without spaces or punctuation. */
export function sungChars(lines: readonly TranscriptLine[]): number {
  return lines
    .filter(isSung)
    .reduce((n, line) => n + line.text.replace(/[\s\p{P}]/gu, '').length, 0);
}

/**
 * Whether the streamer is singing at `at`: of their own lines (not a guest's, said or sung, nor a
 * recording's) that ended in the minute before, at least 3 were sung and they're at least 70% of them. On a singing stream
 * that was 75–100% a minute of singing, and at most 40% (60% once) one of talk, where a line now
 * and then is taken for sung.
 */
export function singingNow(lines: readonly TranscriptLine[], at: number): boolean {
  const lately = lines.filter(
    (line) => isStreamers(line) && at - line.end < 60_000 && line.end <= at,
  );
  const sung = lately.filter(isSung).length;
  return sung >= 3 && sung >= 0.7 * lately.length;
}

/** Whether the streamer said or sang it herself: not a guest's, nor a recording playing. */
function isStreamers(line: TranscriptLine): boolean {
  return !isGuest(line) && !isPlayed(line);
}

/** The song being sung as `line` comes in, and when it started. */
export interface SungSong {
  /** What the streamer said and sang since it started (not a guest's lines, nor a recording's). */
  lines: TranscriptLine[];
  /** When its first sung line started. */
  start: number;
}

/**
 * The song the streamer is singing as of `line`, a line they just said or sang (`transcript`
 * already has it): null when `line` is spoken, a guest's or a recording's, or they aren't singing
 * (see singingNow). Only the streamer's own lines make the song: what a guest sings or a
 * recording plays is left to the log. `spans`: what the song break sources say (see currentSong).
 */
export function singingSong(
  transcript: readonly TranscriptLine[],
  line: TranscriptLine,
  spans?: readonly SongSpan[],
): SungSong | null {
  if (!isStreamerSinging(line)) return null;
  const lines = transcript.filter(isStreamers);
  if (!singingNow(lines, line.end)) return null;
  const song = currentSong(lines, { spans });
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
  played?: { title?: unknown; artist?: unknown } | null;
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
    ...(typeof line.played?.title === 'string' &&
      line.played.title && {
        played: {
          title: line.played.title,
          artist: typeof line.played.artist === 'string' ? line.played.artist : '',
        },
      }),
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
