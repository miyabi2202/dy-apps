import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AskModel, Question } from '../../app/ports';

export interface ClaudeCliOptions {
  /** The `claude` executable; found on PATH by default. */
  command?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** Working directory for the run. */
  cwd?: string;
  /**
   * Built-in tools Claude may use; read-only ones only, since chat is untrusted. All are
   * pre-approved except the file tools, which then reach only `readDirs`: Claude Code lets them
   * read the working directories, and without someone to approve, anything else is denied.
   */
  tools?: readonly string[];
  /** Folders Claude may read (`--add-dir`). */
  readDirs?: readonly string[];
  /** `--model`: an alias like `opus` or a full model name; Claude Code's default when unset. */
  model?: string;
  /** Added to Claude Code's system prompt for every question. */
  systemPrompt?: string;
  spawnProcess?: typeof spawn;
}

/** The bot's own MCP server (src/adapters/mcp/), whose tools are `mcp__bot__<tool>`. */
const BOT_SERVER = 'bot';

/** Tools that read files: never pre-approved, so they stay inside the working directories. */
const FILE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);

/** The stream-json user message `claude -p --input-format stream-json` reads on stdin. */
export function userMessage({ prompt }: Question): string {
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

/**
 * `claude -p`, with the question as a stream-json message on stdin (Claude sees the stream through
 * the bot's look_at_screen, not an attached image).
 * Chat is untrusted, so the run gets only the listed tools (web search and fetch, and reading `readDirs`,
 * by default), no saved session, and no MCP server but the bot's own (which a question gets only
 * when asked to; its look_at_screen is how Claude sees the stream).
 */
export function claudeCli({
  command = 'claude',
  timeoutMs = 120_000,
  cwd,
  tools = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
  readDirs = [],
  model,
  systemPrompt,
  spawnProcess = spawn,
}: ClaudeCliOptions = {}): AskModel {
  const argsFor = (question: Question, mcpConfig: string | null) => {
    const allowed = question.tools ?? tools;
    const preApproved = [
      ...allowed.filter((tool) => !FILE_TOOLS.has(tool)),
      ...(question.botTools?.tools.map((tool) => `mcp__${BOT_SERVER}__${tool}`) ?? []),
    ].join(',');
    const readsFiles = allowed.some((tool) => FILE_TOOLS.has(tool));
    return [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--tools',
      allowed.join(','),
      ...(preApproved ? ['--allowedTools', preApproved] : []),
      ...(readsFiles ? readDirs.flatMap((dir) => ['--add-dir', dir]) : []),
      '--strict-mcp-config',
      ...(mcpConfig ? ['--mcp-config', mcpConfig] : []),
      '--no-session-persistence',
      ...(model ? ['--model', model] : []),
      ...(systemPrompt ? ['--append-system-prompt', systemPrompt] : []),
      ...(question.schema ? ['--json-schema', JSON.stringify(question.schema)] : []),
    ];
  };
  return (question) =>
    new Promise((resolve, reject) => {
      // The MCP config (the bot's tools, reached with this question's token), in a folder of its own.
      const { botTools } = question;
      const dir = botTools ? mkdtempSync(join(tmpdir(), 'chat-bot-mcp-')) : null;
      let mcpConfig: string | null = null;
      if (dir && botTools) {
        const mcpServers = {
          [BOT_SERVER]: {
            type: 'http',
            url: botTools.url,
            headers: { Authorization: `Bearer ${botTools.token}` },
          },
        };
        mcpConfig = join(dir, 'mcp.json');
        writeFileSync(mcpConfig, JSON.stringify({ mcpServers }));
      }
      const cleanUp = () => dir && rmSync(dir, { recursive: true, force: true });
      let child: ReturnType<typeof spawn>;
      try {
        child = spawnProcess(command, argsFor(question, mcpConfig), {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        cleanUp();
        throw err;
      }
      let stdout = '';
      let stderr = '';
      const limitMs = question.timeoutMs ?? timeoutMs;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude timed out after ${limitMs} ms`));
      }, limitMs);
      child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        cleanUp();
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        cleanUp();
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
