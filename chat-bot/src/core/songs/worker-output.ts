import { backingLevelFrom, type BackingLevel } from './backing-gaps';
import { musicAnswerFrom, type MusicAnswer } from './music';
import {
  statusFrom,
  transcriptLineFrom,
  type TranscriptLine,
  type WorkerStatus,
} from './transcript';

/** One line the transcription worker printed, by what it is. */
export type WorkerOutput =
  | { kind: 'music'; answer: MusicAnswer }
  | { kind: 'status'; status: WorkerStatus }
  | { kind: 'backing-level'; level: BackingLevel }
  | { kind: 'line'; line: TranscriptLine };

/**
 * A line of the worker's output, parsed once, as the first of these it fits: a music answer, a
 * status, a backing level, a sentence; null when it isn't JSON or fits none (a diagnostic).
 */
export function parseWorkerOutput(text: string): WorkerOutput | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const answer = musicAnswerFrom(json);
  if (answer) return { kind: 'music', answer };
  const status = text.startsWith('{') ? statusFrom(json) : null;
  if (status) return { kind: 'status', status };
  const level = text.includes('"backing_level"') ? backingLevelFrom(json) : null;
  if (level) return { kind: 'backing-level', level };
  const line = transcriptLineFrom(json);
  return line && { kind: 'line', line };
}
