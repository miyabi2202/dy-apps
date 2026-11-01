import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { claudeCli, resultFrom, userMessage } from '../src/adapters/claude-cli';

/** A fake `spawn` for `claude`: records the command, args and stdin, prints `stdout`, closes with `code`. */
function fakeSpawn(stdout: string, code = 0) {
  const calls: { command: string; args: readonly string[]; stdin: string }[] = [];
  const spawnProcess = ((command: string, args: readonly string[]) => {
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
    const call = { command, args, stdin: '' };
    calls.push(call);
    child.stdout = Readable.from([Buffer.from(stdout)]);
    child.stderr = Readable.from([Buffer.from('')]);
    child.stdin = new Writable({
      write(chunk: Buffer, _enc, done) {
        call.stdin += chunk.toString();
        done();
      },
      final(done) {
        setImmediate(() => child.emit('close', code));
        done();
      },
    });
    child.kill = () => true;
    return child;
  }) as unknown as typeof spawn;
  return { spawnProcess, calls };
}

const success = JSON.stringify({ type: 'result', subtype: 'success', result: ' 答案 ' });

describe('claudeCli', () => {
  it('sends the prompt as a stream-json message with every tool off, and gives the result text', async () => {
    const { spawnProcess, calls } = fakeSpawn(`{"type":"system"}\n${success}\n`);
    const ask = claudeCli({ spawnProcess, model: 'opus' });
    expect(await ask('问题')).toBe('答案');
    const [call] = calls;
    expect(call!.command).toBe('claude');
    expect(call!.args).toEqual(
      expect.arrayContaining(['-p', '--tools', '', '--no-session-persistence', '--model', 'opus']),
    );
    expect(call!.stdin).toBe(userMessage('问题') + '\n');
  });

  it('rejects with the exit code when claude fails', async () => {
    const { spawnProcess } = fakeSpawn('', 1);
    await expect(claudeCli({ spawnProcess })('x')).rejects.toThrow('claude exited with 1');
  });
});

describe('resultFrom', () => {
  it('throws for an error result and for none', () => {
    expect(() =>
      resultFrom('{"type":"result","subtype":"error_max_turns","is_error":true,"result":"no"}'),
    ).toThrow('claude failed');
    expect(() => resultFrom('nothing')).toThrow('no result');
  });
});
