import { spawn as spawnProcess } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { SpawnWorker } from '../app/ports';

/**
 * `uv run asr/transcribe.py <url>`, in the package's `asr/` project, read line by line; requests
 * are written to its stdin.
 */
export function uvWorker(asrDir: string, spawn: typeof spawnProcess = spawnProcess): SpawnWorker {
  return (url, { onLine, onLog }) => {
    const child = spawn(
      'uv',
      ['run', '-q', '--directory', asrDir, join(asrDir, 'transcribe.py'), url],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        // Let PyTorch run what Apple's GPU can't on the CPU instead of failing.
        env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' },
      },
    );
    if (child.stdout) createInterface({ input: child.stdout }).on('line', onLine);
    if (child.stderr) createInterface({ input: child.stderr }).on('line', onLog);
    return {
      kill: () => child.kill(),
      send: (line) => child.stdin?.write(`${line}\n`),
      exited: new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      }),
    };
  };
}
