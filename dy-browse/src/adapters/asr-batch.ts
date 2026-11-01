// Speaks the stdin protocol documented at the top of chat-bot/asr/transcribe.py (a `{"url": …}`
// line in, sentence lines out, then `{"stream_ended": true}`), as its own child process: chat-bot's
// script is run, not modified, and the live speech service on 8758 is never contacted.
import { spawn } from 'node:child_process';
import { SerialQueue } from '@dy-apps/douyin-chrome';
import type { BatchTranscriber, Log } from '../app/ports';
import { JsonLinesProcess } from './json-lines-process';

export interface BatchTranscriberOptions {
  /** `chat-bot/asr`, where `transcribe.py` and its uv project are. */
  asrDir: string;
  log?: Log;
  spawnProcess?: typeof spawn;
  /** `uv` itself; found on PATH by default. */
  uv?: string;
  /** Gives up on one request (and on the models loading) after this long, in ms. */
  timeoutMs?: number;
}

/** Whether most sentences score more as music than as speech (AST's `music` over `speech`). */
function mostlyMusic(sentences: readonly { speech?: unknown; music?: unknown }[]): boolean {
  const scored = sentences.filter(
    (s) => typeof s.speech === 'number' && typeof s.music === 'number',
  );
  if (!scored.length) return false;
  const music = scored.filter((s) => (s.music as number) > (s.speech as number)).length;
  return music * 2 > scored.length;
}

/**
 * `uv run --directory <asrDir> transcribe.py --no-backing-title --no-backing-gaps`, a fresh
 * instance for the run (so the voices it hears in strangers' videos never reach the live service),
 * one URL at a time, quit at the end of the run. When the sentences score as music it asks Shazam
 * for the title and the transcript is dropped.
 */
export async function spawnBatchTranscriber(
  options: BatchTranscriberOptions,
): Promise<BatchTranscriber> {
  const {
    asrDir,
    log = () => {},
    spawnProcess = spawn,
    uv = 'uv',
    timeoutMs = 15 * 60_000,
  } = options;
  const child = spawnProcess(
    uv,
    ['run', '--directory', asrDir, 'transcribe.py', '--no-backing-title', '--no-backing-gaps'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const worker = new JsonLinesProcess(child, 'asr', log);
  await worker.readUntil((line) => line.ready === true, 'loading the models', timeoutMs);
  const queue = new SerialQueue();
  let musicId = 0;

  return {
    // One URL at a time: a new URL while one plays would replace it.
    transcribe: (path) =>
      queue.run(async () => {
        worker.send({ url: path });
        const lines = await worker.readUntil(
          (line) => line.stream_ended === true,
          `transcribing ${path}`,
          timeoutMs,
        );
        const sentences = lines.filter((line) => typeof line.text === 'string');
        if (!mostlyMusic(sentences)) {
          const texts = sentences.map((s) => (s.text as string).trim()).filter(Boolean);
          return { sentences: texts, song: null };
        }
        const id = ++musicId;
        worker.send({ music_id: id });
        const answered = await worker.readUntil(
          (line) => line.music_id === id,
          'naming the music',
          timeoutMs,
        );
        const answer = answered[answered.length - 1];
        const title = typeof answer?.title === 'string' ? answer.title : null;
        const artist = typeof answer?.artist === 'string' ? answer.artist : '';
        return { sentences: [], song: title ? { title, artist } : null };
      }),
    close: () => worker.close({ quit: true }, 5000),
  };
}
