import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Log } from '../app/ports';
import { errorMessage } from '../core/errors';

/** One entry of `room_config.json`'s `download`: fetch `url` into `artifacts/<file>`. */
export interface Download {
  url: string;
  file: string;
}

/**
 * The `download` list in the room's `room_config.json` (`[{ "url", "file" }]`), skipping entries
 * that aren't a URL and a plain file name; none when the file or the list is missing.
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
    const { url, file } = entry ?? {};
    // A bare name, so a download can't land outside artifacts/.
    const ok =
      typeof url === 'string' &&
      /^https?:\/\//.test(url) &&
      typeof file === 'string' &&
      file !== '' &&
      basename(file) === file &&
      file !== '.' &&
      file !== '..';
    if (!ok) log.warn('room_config.json: skipping a download', { entry });
    return ok;
  });
}

/**
 * Fetches each download into `dir` (`data/<房间号>/artifacts/`), replacing what's there, one after
 * another. A failed one is logged and leaves the old file; the rest still run.
 */
export async function runDownloads(
  downloads: Download[],
  dir: string,
  {
    log,
    fetch: fetchFn = fetch,
    write = writeFileSync,
  }: { log: Log; fetch?: typeof fetch; write?: (path: string, data: Uint8Array) => void },
): Promise<void> {
  if (downloads.length === 0) return;
  mkdirSync(dir, { recursive: true });
  for (const { url, file } of downloads) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = new Uint8Array(await res.arrayBuffer());
      write(join(dir, file), data);
      log.info('downloaded', { url, file, bytes: data.length });
    } catch (err) {
      log.warn('download failed', { url, file, error: errorMessage(err) });
    }
  }
}
