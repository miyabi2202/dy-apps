import { spawn } from 'node:child_process';

/** One question for Claude: the prompt, and optionally a JPEG to look at with it. */
export interface Question {
  prompt: string;
  image?: Uint8Array;
}

/** Asks Claude one question and resolves with its answer. */
export type AskClaude = (question: Question) => Promise<string>;

export interface ClaudeCliOptions {
  /** The `claude` executable; found on PATH by default. */
  command?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** Working directory for the run. */
  cwd?: string;
  /** Built-in tools Claude may use, all pre-approved; read-only ones only, since chat is untrusted. */
  tools?: readonly string[];
  /** `--model`: an alias like `opus` or a full model name; Claude Code's default when unset. */
  model?: string;
  /** Added to Claude Code's system prompt for every question. */
  systemPrompt?: string;
  spawnProcess?: typeof spawn;
}

/** The stream-json user message `claude -p --input-format stream-json` reads on stdin. */
export function userMessage({ prompt, image }: Question): string {
  const content = [
    ...(image
      ? [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: Buffer.from(image).toString('base64'),
            },
          },
        ]
      : []),
    { type: 'text', text: prompt },
  ];
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

/**
 * `claude -p`, with the question as a stream-json message on stdin so it can carry an image.
 * Chat is untrusted, so the run gets only the listed tools (web search by default), no MCP
 * servers and no saved session.
 */
export function claudeCli({
  command = 'claude',
  timeoutMs = 120_000,
  cwd,
  tools = ['WebSearch'],
  model,
  systemPrompt,
  spawnProcess = spawn,
}: ClaudeCliOptions = {}): AskClaude {
  const toolList = tools.join(',');
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    toolList,
    ...(tools.length ? ['--allowedTools', toolList] : []),
    '--strict-mcp-config',
    '--no-session-persistence',
    ...(model ? ['--model', model] : []),
    ...(systemPrompt ? ['--append-system-prompt', systemPrompt] : []),
  ];
  return (question) =>
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
      child.stdin?.end(userMessage(question) + '\n');
    });
}
