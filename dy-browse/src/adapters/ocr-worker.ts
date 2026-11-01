import { spawn } from 'node:child_process';
import { SerialQueue } from '@dy-apps/douyin-chrome';
import type { Log, Ocr } from '../app/ports';
import { JsonLinesProcess, type Line } from './json-lines-process';

export interface OcrOptions {
  /** `dy-browse/ocr`, the uv project with `ocr-worker.py`. */
  ocrDir: string;
  /** Off with `--no-ocr`. */
  enabled?: boolean;
  /** `process.platform`; Apple Vision is macOS only. */
  platform?: NodeJS.Platform;
  log?: Log;
  spawnProcess?: typeof spawn;
  uv?: string;
  /** Lines the recognizer is less sure of than this are left out. */
  minConfidence?: number;
  timeoutMs?: number;
}

/**
 * The OCR worker (`dy-browse/ocr/ocr-worker.py`, Apple Vision through `ocrmac`): one JSON line a
 * request, `{"image": "<path>"}` in, `{"lines": [{"text", "confidence"}]}` out. Null with
 * `--no-ocr`, and on a machine that isn't macOS, with a warning.
 */
export async function spawnOcr(options: OcrOptions): Promise<Ocr | null> {
  const {
    ocrDir,
    enabled = true,
    platform = process.platform,
    log = () => {},
    spawnProcess = spawn,
    uv = 'uv',
    minConfidence = 0.4,
    timeoutMs = 60_000,
  } = options;
  if (!enabled) return null;
  if (platform !== 'darwin') {
    log('警告：OCR 用的是 macOS 的 Apple Vision，这台机器不是 macOS：不做 OCR。');
    return null;
  }
  const child = spawnProcess(uv, ['run', '--directory', ocrDir, 'ocr-worker.py'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const worker = new JsonLinesProcess(child, 'ocr', log);
  await worker.readUntil((line) => line.ready === true, 'starting', timeoutMs);
  const queue = new SerialQueue();

  return {
    read: (images) =>
      queue.run(async () => {
        const out: string[] = [];
        for (const image of images) {
          worker.send({ image });
          const lines = await worker.readUntil(
            (line) => Array.isArray(line.lines) || typeof line.error === 'string',
            `reading ${image}`,
            timeoutMs,
          );
          const reply = lines[lines.length - 1]!;
          if (typeof reply.error === 'string') {
            log(`ocr: ${image}: ${reply.error}`);
            continue;
          }
          for (const line of reply.lines as Line[]) {
            const text = typeof line.text === 'string' ? line.text.trim() : '';
            const confidence = typeof line.confidence === 'number' ? line.confidence : 1;
            if (text && confidence >= minConfidence) out.push(text);
          }
        }
        return out;
      }),
    close: () => worker.close({ quit: true }, 3000),
  };
}
