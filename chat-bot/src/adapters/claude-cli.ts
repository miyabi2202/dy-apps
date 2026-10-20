import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AskModel, Question } from '../app/ports';

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
  /** `--effort` (low, medium, high, xhigh, max); Claude Code's default when unset. */
  effort?: string;
  /**
   * The MCP server with the `zoom` tool (zoom-mcp.ts), started with the screenshot's file as its
   * last argument for a question that has one, so Claude can look closer at part of it.
   */
  zoom?: { command: string; args: readonly string[] };
  spawnProcess?: typeof spawn;
}

/** The zoom server's tool, as Claude Code names an MCP tool. */
const ZOOM_TOOL = 'mcp__zoom__zoom';

/** Tools that read files: never pre-approved, so they stay inside the working directories. */
const FILE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);

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
 * Chat is untrusted, so the run gets only the listed tools (web search and fetch, and reading `readDirs`,
 * by default), no saved session, and no MCP server but `zoom` (which only reads the screenshot),
 * for a question with one.
 */
export function claudeCli({
  command = 'claude',
  timeoutMs = 120_000,
  cwd,
  tools = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
  readDirs = [],
  model,
  systemPrompt,
  effort,
  zoom,
  spawnProcess = spawn,
}: ClaudeCliOptions = {}): AskModel {
  const argsFor = (question: Question, mcpConfig: string | null) => {
    const allowed = question.tools ?? tools;
    const preApproved = [
      ...allowed.filter((tool) => !FILE_TOOLS.has(tool)),
      ...(mcpConfig ? [ZOOM_TOOL] : []),
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
      ...(effort ? ['--effort', effort] : []),
      ...(systemPrompt ? ['--append-system-prompt', systemPrompt] : []),
      ...(question.maxTurns ? ['--max-turns', String(question.maxTurns)] : []),
      ...(question.schema ? ['--json-schema', JSON.stringify(question.schema)] : []),
    ];
  };
  return (question) =>
    new Promise((resolve, reject) => {
      // The screenshot, and the config that starts the zoom server on it, in a folder of their own.
      const dir = zoom && question.image ? mkdtempSync(join(tmpdir(), 'chat-bot-zoom-')) : null;
      let mcpConfig: string | null = null;
      if (dir && zoom && question.image) {
        const screenshot = join(dir, 'screenshot.jpg');
        writeFileSync(screenshot, question.image);
        mcpConfig = join(dir, 'mcp.json');
        const server = { command: zoom.command, args: [...zoom.args, screenshot] };
        writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { zoom: server } }));
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
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude timed out after ${timeoutMs} ms`));
      }, timeoutMs);
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
