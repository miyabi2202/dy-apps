import { spawn } from 'node:child_process';
import type { AskClaude } from '../app/ports';

export interface AgyCliOptions {
  /** The `agy` executable (Google's Antigravity CLI); found on PATH by default. */
  command?: string;
  /** `--model`, one of `agy models`. */
  model?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** Working directory for the run: an empty one, so there's nothing for it to read. */
  cwd?: string;
  /** Put before every prompt, as agy has no system prompt option. */
  systemPrompt?: string;
  spawnProcess?: typeof spawn;
}

/** The answer in `agy -p --output-format json` output, or an error saying why there's none. */
export function agyResult(output: string): string {
  let result: { status?: string; response?: string; error?: string };
  try {
    result = JSON.parse(output) as typeof result;
  } catch {
    throw new Error('agy gave no result');
  }
  if (result.status !== 'SUCCESS') {
    throw new Error(`agy failed (${result.status}): ${result.error ?? result.response ?? ''}`);
  }
  return (result.response ?? '').trim();
}

/**
 * Asks Gemini through Antigravity's CLI, `agy -p`, which searches with Google. Chat is
 * untrusted, so it runs sandboxed (no terminal), with slash commands off and nothing
 * pre-approved: its tools that need approval are denied, and web search doesn't. It can't take
 * a screenshot, nor narrow its tools or cap its turns per question, so those are left out. It
 * uses the logged-in user's Antigravity account: run `agy` once to log in.
 */
export function agyCli({
  command = 'agy',
  model,
  timeoutMs = 120_000,
  cwd,
  systemPrompt,
  spawnProcess = spawn,
}: AgyCliOptions = {}): AskClaude {
  return ({ prompt }) =>
    new Promise((resolve, reject) => {
      const args = [
        '-p',
        systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
        '--output-format',
        'json',
        '--sandbox',
        '--disable-slash-commands',
        '--print-timeout',
        `${Math.ceil(timeoutMs / 1000)}s`,
        ...(model ? ['--model', model] : []),
      ];
      const child = spawnProcess(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`agy timed out after ${timeoutMs} ms`));
      }, timeoutMs + 5000);
      child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          resolve(agyResult(stdout));
        } catch (err) {
          reject(
            code === 0 && err instanceof Error
              ? err
              : new Error(`agy exited with ${code}: ${stderr.trim().slice(-500)}`),
          );
        }
      });
    });
}
