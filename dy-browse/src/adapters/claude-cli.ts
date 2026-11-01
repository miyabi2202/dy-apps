// Much reduced from chat-bot's adapters/models/claude-cli.ts: one prompt in, the answer's text out,
// no tools, no MCP.
import { spawn } from 'node:child_process';
import type { AskClaude } from '../app/ports';

export interface ClaudeCliOptions {
  /** The `claude` executable; found on PATH by default. */
  command?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** `--model`: an alias like `opus` or a full name; Claude Code's default when unset. */
  model?: string | null;
  spawnProcess?: typeof spawn;
}

/** The stream-json user message `claude -p --input-format stream-json` reads on stdin. */
export function userMessage(prompt: string): string {
  const content = [{ type: 'text', text: prompt }];
  return JSON.stringify({ type: 'user', message: { role: 'user', content } });
}

/** The answer in `claude -p --output-format stream-json` output: its `result` line. */
export function resultFrom(output: string): string {
  for (const line of output.split('\n').reverse()) {
    let event: { type?: string; subtype?: string; is_error?: boolean; result?: string };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type !== 'result') continue;
    if (event.is_error || event.subtype !== 'success') {
      throw new Error(`claude failed (${event.subtype}): ${event.result ?? ''}`);
    }
    return (event.result ?? '').trim();
  }
  throw new Error('claude gave no result');
}

/** `claude -p` with every tool off and no saved session: the text of what browsing found goes in, text comes out. */
export function claudeCli({
  command = 'claude',
  timeoutMs = 300_000,
  model = null,
  spawnProcess = spawn,
}: ClaudeCliOptions = {}): AskClaude {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    '',
    '--strict-mcp-config',
    '--no-session-persistence',
    ...(model ? ['--model', model] : []),
  ];
  return (prompt) =>
    new Promise((resolve, reject) => {
      const child = spawnProcess(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          resolve(resultFrom(stdout));
        } catch (err) {
          reject(
            code === 0 && err instanceof Error
              ? err
              : new Error(`claude exited with ${code}: ${stderr.trim()}`),
          );
        }
      });
      child.stdin?.end(userMessage(prompt) + '\n');
    });
}
