import { spawn } from 'node:child_process';
import type { CropImage } from '../../app/ports';
import { zoomArgs } from '../../core/replies/zoom';

/** Crops with ffmpeg, the JPEG going in on stdin and coming out on stdout, without blocking the bot. */
export function ffmpegCrop(ffmpeg = 'ffmpeg', spawnProcess: typeof spawn = spawn): CropImage {
  return (image, region, scale) =>
    new Promise((resolve, reject) => {
      const child = spawnProcess(ffmpeg, zoomArgs('pipe:0', region, scale), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out: Buffer[] = [];
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(new Uint8Array(Buffer.concat(out)));
        else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
      });
      child.stdin?.end(Buffer.from(image));
    });
}
