import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { ffmpegCrop } from '../../../src/adapters/models/ffmpeg-crop';

function fakeFfmpeg(code: number, stdout: Buffer, stderr = '') {
  const seen: { command?: string; args?: readonly string[]; stdin?: Buffer } = {};
  const spawnProcess = ((command: string, args: readonly string[]) => {
    seen.command = command;
    seen.args = args;
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: {
        end: (data: Buffer) => {
          seen.stdin = data;
          setImmediate(() => {
            child.stdout.emit('data', stdout);
            if (stderr) child.stderr.emit('data', Buffer.from(stderr));
            child.emit('close', code);
          });
        },
      },
    });
    return child;
  }) as unknown as typeof spawn;
  return { seen, spawnProcess };
}

const region = { x: 10, y: 20, width: 30, height: 40 };

test('pipes the JPEG through ffmpeg and gives back what it wrote', async () => {
  const { seen, spawnProcess } = fakeFfmpeg(0, Buffer.from([0xff, 0xd8, 9]));
  const out = await ffmpegCrop('ffmpeg', spawnProcess)(new Uint8Array([0xff, 0xd8]), region, 2);
  expect([...out]).toEqual([0xff, 0xd8, 9]);
  expect(seen.command).toBe('ffmpeg');
  expect(seen.args).toEqual(expect.arrayContaining(['-i', 'pipe:0', 'pipe:1']));
  expect(seen.args).toContain('crop=30:40:10:20,scale=60:80:flags=lanczos');
  expect([...seen.stdin!]).toEqual([0xff, 0xd8]);
});

test('an ffmpeg that fails rejects with what it said', async () => {
  const { spawnProcess } = fakeFfmpeg(1, Buffer.alloc(0), 'Invalid data found');
  await expect(ffmpegCrop('ffmpeg', spawnProcess)(new Uint8Array([1]), region, 2)).rejects.toThrow(
    'Invalid data found',
  );
});
