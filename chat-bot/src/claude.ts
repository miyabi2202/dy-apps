import { spawn } from 'node:child_process';

/** Asks Claude one question and resolves with its answer. */
export type AskClaude = (prompt: string) => Promise<string>;

export interface ClaudeCliOptions {
  /** The `claude` executable; found on PATH by default. */
  command?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** Working directory for the run. */
  cwd?: string;
  spawnProcess?: typeof spawn;
}

/**
 * `claude -p`, with the prompt on stdin. Chat is untrusted, so the run gets no tools, no MCP
 * servers and no saved session: it can only answer in text.
 */
export function claudeCli({
  command = 'claude',
  timeoutMs = 120_000,
  cwd,
  spawnProcess = spawn,
}: ClaudeCliOptions = {}): AskClaude {
  const args = [
    '-p',
    '--output-format',
    'text',
    '--tools',
    '',
    '--strict-mcp-config',
    '--no-session-persistence',
  ];
  return (prompt) =>
    new Promise((resolve, reject) => {
      const child = spawnProcess(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`claude exited with ${code}: ${stderr.trim()}`));
      });
      child.stdin?.end(prompt);
    });
}
