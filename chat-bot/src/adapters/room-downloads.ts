import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Log } from '../app/ports';
import { isInside } from '../core/additional-command';
import { errorMessage } from '../core/errors';

/**
 * One entry of `room_config.json`'s `download`: fetch `url` into `artifacts/<file>`, through the
 * `transformer` script first when there is one.
 */
export interface Download {
  url: string;
  file: string;
  /**
   * A script in the room's folder (`additional_commands/can-sing/songs-transformer.js`) that turns
   * what was fetched into what's kept.
   */
  transformer?: string;
}

/** Runs `script` in `cwd` with `input` on stdin: what it printed, or why it couldn't. */
export type Transform = (
  script: string,
  input: Uint8Array,
  cwd: string,
) => Uint8Array | { error: string };

/** The script with Node, as a child process, so it can't hurt the bot. */
const transformWithNode: Transform = (script, input, cwd) => {
  const run = spawnSync(process.execPath, [script], {
    cwd,
    input,
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) return { error: run.error.message };
  if (run.status !== 0) return { error: run.stderr.toString().trim() || `exited ${run.status}` };
  return new Uint8Array(run.stdout);
};

/**
 * The `download` list in the room's `room_config.json` (`[{ "url", "file", "transformer"? }]`),
 * skipping entries that aren't a URL and a plain file name, or whose transformer is outside the
 * room's folder; none when the file or the list is missing.
 */
export function readDownloads(
  path: string,
  { log, read = (p) => readFileSync(p, 'utf8') }: { log: Log; read?: (path: string) => string },
): Download[] {
  let list: unknown;
  try {
    list = (JSON.parse(read(path)) as Record<string, unknown>).download ?? [];
  } catch (err) {
    log.warn('could not read room_config.json for downloads', { error: errorMessage(err) });
    return [];
  }
  if (!Array.isArray(list)) {
    log.warn('room_config.json: download must be a list of { url, file }');
    return [];
  }
  return list.filter((entry: Partial<Download>): entry is Download => {
    const { url, file, transformer } = entry ?? {};
    // A bare name, so a download can't land outside artifacts/.
    const ok =
      typeof url === 'string' &&
      /^https?:\/\//.test(url) &&
      typeof file === 'string' &&
      file !== '' &&
      basename(file) === file &&
      file !== '.' &&
      file !== '..' &&
      (transformer === undefined || (typeof transformer === 'string' && isInside(transformer)));
    if (!ok) log.warn('room_config.json: skipping a download', { entry });
    return ok;
  });
}

/**
 * Fetches each download into `<roomDir>/artifacts/`, replacing what's there, one after another.
 * One with a transformer has it run in `roomDir` with what was fetched on stdin, and what it
 * prints is kept instead. A failed one (fetching or transforming) is logged and leaves the old
 * file; the rest still run.
 */
export async function runDownloads(
  downloads: Download[],
  roomDir: string,
  {
    log,
    fetch: fetchFn = fetch,
    write = writeFileSync,
    transform = transformWithNode,
  }: {
    log: Log;
    fetch?: typeof fetch;
    write?: (path: string, data: Uint8Array) => void;
    transform?: Transform;
  },
): Promise<void> {
  if (downloads.length === 0) return;
  const dir = join(roomDir, 'artifacts');
  mkdirSync(dir, { recursive: true });
  for (const { url, file, transformer } of downloads) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data: Uint8Array = new Uint8Array(await res.arrayBuffer());
      if (transformer) {
        const out = transform(join(roomDir, transformer), data, roomDir);
        if (!(out instanceof Uint8Array)) throw new Error(`${transformer}: ${out.error}`);
        data = out;
      }
      write(join(dir, file), data);
      log.info('downloaded', { url, file, bytes: data.length, transformer });
    } catch (err) {
      log.warn('download failed', { url, file, error: errorMessage(err) });
    }
  }
}
