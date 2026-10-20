import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AskModel } from '../app/ports';

export interface CodexCliOptions {
  /** The `codex` executable (OpenAI's Codex CLI); found on PATH by default. */
  command?: string;
  /** `--model`, like `gpt-6-luna`; the user's default when unset. */
  model?: string;
  /** How hard it thinks: `low`, `medium`, `high`… */
  effort?: string;
  /** Kill the run after this long. */
  timeoutMs?: number;
  /** Working directory for the run: an empty one, so there's nothing for it to read. */
  cwd?: string;
  /** Put before every prompt, as codex has no system prompt option. */
  systemPrompt?: string;
  /** Whether it may search the web (live); on unless turned off. */
  webSearch?: boolean;
  /**
   * The MCP server with the `zoom` tool (zoom-mcp.ts), started with the screenshot's file as its
   * last argument for a question that has one; its one tool is pre-approved, as codex exec has no
   * one to ask.
   */
  zoom?: { command: string; args: readonly string[] };
  spawnProcess?: typeof spawn;
}

/** The final message in `codex exec --json` output, or an error saying why there's none. */
export function codexResult(output: string): string {
  let answer: string | null = null;
  for (const line of output.split('\n')) {
    let event: {
      type?: string;
      item?: { type?: string; text?: string };
      error?: { message?: string };
      message?: string;
    };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type === 'turn.failed' || event.type === 'error') {
      throw new Error(`codex failed: ${event.error?.message ?? event.message ?? ''}`);
    }
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      answer = event.item.text ?? '';
    }
  }
  if (answer === null) throw new Error('codex gave no answer');
  return answer.trim();
}

/**
 * Asks OpenAI's Codex CLI, `codex exec`, with live web search (Google, among others). Chat is
 * untrusted, so it runs in a read-only sandbox in an empty folder, keeps no session, and ignores
 * the user's own Codex config and rules (their AGENTS.md, memories, hooks and plugins). A
 * screenshot goes with the prompt (`-i`); it can't narrow its tools or cap its turns per question,
 * so those are left out.
 * It uses the logged-in user's account: `codex login` once.
 */
export function codexCli({
  command = 'codex',
  model,
  effort,
  timeoutMs = 120_000,
  cwd,
  systemPrompt,
  webSearch = true,
  zoom,
  spawnProcess = spawn,
}: CodexCliOptions = {}): AskModel {
  return ({ prompt, schema, image }) =>
    new Promise((resolve, reject) => {
      // codex reads the answer's schema, and the screenshot, from files.
      const dir = schema || image ? mkdtempSync(join(tmpdir(), 'codex-question-')) : null;
      const schemaFile = dir && schema ? join(dir, 'schema.json') : null;
      if (schemaFile) writeFileSync(schemaFile, JSON.stringify(schema));
      const imageFile = dir && image ? join(dir, 'screenshot.jpg') : null;
      if (imageFile && image) writeFileSync(imageFile, image);
      const cleanUp = () => dir && rmSync(dir, { recursive: true, force: true });
      const args = [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '--ignore-user-config',
        '--ignore-rules',
        '--sandbox',
        'read-only',
        ...(cwd ? ['--cd', cwd] : []),
        ...(model ? ['--model', model] : []),
        ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []),
        '-c',
        `web_search="${webSearch ? 'live' : 'disabled'}"`,
        '--json',
        ...(schemaFile ? ['--output-schema', schemaFile] : []),
        ...(zoom && imageFile
          ? [
              '-c',
              `mcp_servers.zoom.command=${JSON.stringify(zoom.command)}`,
              '-c',
              `mcp_servers.zoom.args=${JSON.stringify([...zoom.args, imageFile])}`,
              '-c',
              'mcp_servers.zoom.tools.zoom.approval_mode="approve"',
            ]
          : []),
        // `-i` takes any number of files, so `--` ends them before the prompt.
        ...(imageFile ? ['-i', imageFile, '--'] : []),
        systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
      ];
      let child: ReturnType<typeof spawn>;
      try {
        child = spawnProcess(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        cleanUp();
        throw err;
      }
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        cleanUp();
        reject(new Error(`codex timed out after ${timeoutMs} ms`));
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
          resolve(codexResult(stdout));
        } catch (err) {
          reject(
            code === 0 && err instanceof Error
              ? err
              : new Error(`codex exited with ${code}: ${stderr.trim().slice(-500)}`),
          );
        }
      });
    });
}
