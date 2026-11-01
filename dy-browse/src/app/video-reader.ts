import type { RunState } from '../core/run-state';
import type { BrowseItem, Material } from '../core/types';
import type { BatchTranscriber, Log, MediaFetcher, Ocr } from './ports';
import type { StreamGuard } from './stream-guard';

/** Tiers 1 and 2 for one item (speech, picture text); null when there's nothing to add. */
export interface ItemReader {
  read(item: BrowseItem): Promise<Material | null>;
}

export interface VideoReaderOptions {
  media: MediaFetcher;
  /** Null with `--no-asr`. */
  transcriber: BatchTranscriber | null;
  /** Null with `--no-ocr`, or off macOS. */
  ocr: Ocr | null;
  state: RunState;
  /** Checked before each tier-1 job: a stream that started ends the run (StreamStartedError). */
  guard: StreamGuard;
  log: Log;
}

/**
 * Tiers 1–2 for one item: the audio to a transcript, a few keyframes to picture text. Each stage is
 * written to the run's state as it completes, so a rerun skips what's done; the media is released
 * (deleted) in `finally`. An item that can't be fetched or read is skipped with a log line, not
 * the run; a stream starting stops the run.
 */
export class VideoReader implements ItemReader {
  constructor(private readonly options: VideoReaderOptions) {}

  async read(item: BrowseItem): Promise<Material | null> {
    const { media, transcriber, ocr, state, guard, log } = this.options;
    if (item.kind === 'ad' || item.kind === 'live' || item.kind === 'shop') return null;
    if (!state.reached(item.id, 'metadata')) state.advance(item.id, 'metadata');
    if (!transcriber && !ocr) return null;

    const needSpeech =
      !!transcriber && state.get(item.id)?.transcript === undefined && item.kind === 'video';
    const needOcr = !!ocr && state.get(item.id)?.ocr === undefined;
    if (needSpeech || needOcr) {
      // Between jobs, so a stream that started ends the run rather than sharing its GPU.
      await guard.assertStillQuiet();
      let fetched;
      try {
        fetched = await media.fetch(item);
      } catch (e) {
        log(`media failed {id: ${item.id}}: ${e instanceof Error ? e.message : String(e)}`);
        return this.material(item.id);
      }
      try {
        if (needSpeech && transcriber) {
          if (fetched.audio) {
            const { sentences, song } = await transcriber.transcribe(fetched.audio);
            state.advance(item.id, 'transcribed', { transcript: sentences, song });
          } else {
            state.advance(item.id, 'transcribed', { transcript: [], song: null });
          }
        }
        if (needOcr && ocr) {
          const lines = fetched.frames.length ? await ocr.read(fetched.frames) : [];
          state.advance(item.id, 'ocr', { ocr: lines });
        }
        const have = state.get(item.id);
        const speechDone = !transcriber || item.kind !== 'video' || have?.transcript !== undefined;
        if (speechDone && (!ocr || have?.ocr !== undefined)) state.advance(item.id, 'done');
      } catch (e) {
        log(`read failed {id: ${item.id}}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await fetched.release();
      }
    }
    return this.material(item.id);
  }

  private material(id: string): Material | null {
    const have = this.options.state.get(id);
    if (!have || (have.transcript === undefined && have.ocr === undefined)) return null;
    return { transcript: have.transcript ?? [], song: have.song ?? null, ocr: have.ocr ?? [] };
  }
}
