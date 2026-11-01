import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Media, MediaFetcher } from '../app/ports';

/** A spawned command's result. Injected, so tests give a fake instead of running ffmpeg. */
export type RunCommand = (
  command: string,
  args: readonly string[],
) => Promise<{ code: number; stderr: string }>;

/** The real one: `spawn`, output kept only for its tail. */
export const runCommand: RunCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });

/** The files under the media folder: the real ones by default. */
export interface MediaFs {
  mkdir(dir: string): void;
  write(path: string, bytes: Uint8Array): void;
  /** File names in `dir` (empty if there's no such folder), sorted. */
  list(dir: string): string[];
  /** Deletes a file or folder, whether or not it's there. */
  remove(path: string): void;
}

export const realMediaFs: MediaFs = {
  mkdir: (dir) => void mkdirSync(dir, { recursive: true }),
  write: (path, bytes) => writeFileSync(path, bytes),
  list: (dir) => {
    try {
      return readdirSync(dir).sort();
    } catch {
      return [];
    }
  },
  remove: (path) => rmSync(path, { recursive: true, force: true }),
};

export interface MediaStoreOptions {
  /** `dy-browse/data/media`: one folder per item, deleted once it's released. */
  root: string;
  /** Downloads a URL through the browser's own session (the play URL wants Douyin's cookies and referer). */
  download: (url: string, referer: string) => Promise<Uint8Array>;
  run?: RunCommand;
  fs?: MediaFs;
  ffmpeg?: string;
  /** The most keyframes taken from one video. */
  maxFrames?: number;
}

/**
 * Media for tiers 1–2: the video downloaded, its audio and 3–8 keyframes (ffmpeg's scene change,
 * or one every few seconds when nothing changes) taken out, the video deleted at once, and the
 * rest deleted when released. An image post's own images are its frames. No video is kept.
 */
export class MediaStore implements MediaFetcher {
  private readonly run: RunCommand;
  private readonly fs: MediaFs;
  private readonly ffmpeg: string;
  private readonly maxFrames: number;

  constructor(private readonly options: MediaStoreOptions) {
    this.run = options.run ?? runCommand;
    this.fs = options.fs ?? realMediaFs;
    this.ffmpeg = options.ffmpeg ?? 'ffmpeg';
    this.maxFrames = options.maxFrames ?? 8;
  }

  async fetch(item: {
    id: string;
    playUrl: string | null;
    imageUrls: string[];
    url: string;
  }): Promise<Media> {
    const dir = join(this.options.root, item.id.replace(/[^\w-]/g, '_'));
    const release = () => Promise.resolve(this.fs.remove(dir));
    try {
      this.fs.mkdir(dir);
      if (item.playUrl) return await this.fromVideo(dir, item.playUrl, item.url, release);
      return await this.fromImages(dir, item.imageUrls, item.url, release);
    } catch (e) {
      this.fs.remove(dir);
      throw e;
    }
  }

  private async fromVideo(
    dir: string,
    playUrl: string,
    referer: string,
    release: () => Promise<void>,
  ): Promise<Media> {
    const video = join(dir, 'video.mp4');
    const audio = join(dir, 'audio.m4a');
    const framesDir = join(dir, 'frames');
    this.fs.write(video, await this.options.download(playUrl, referer));
    const audioOut = await this.run(this.ffmpeg, [
      '-y',
      '-i',
      video,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'aac',
      audio,
    ]);
    this.fs.mkdir(framesDir);
    const frame = (filter: string) =>
      this.run(this.ffmpeg, [
        '-y',
        '-i',
        video,
        '-vf',
        filter,
        '-vsync',
        'vfr',
        '-frames:v',
        String(this.maxFrames),
        '-q:v',
        '3',
        join(framesDir, 'frame-%02d.jpg'),
      ]);
    await frame("select='gt(scene,0.3)',scale=1280:-2");
    // A video with no cuts has no scene changes: take one picture every few seconds instead.
    if (this.fs.list(framesDir).length === 0) await frame('fps=1/3,scale=1280:-2');
    // The video itself isn't kept.
    this.fs.remove(video);
    return {
      audio: audioOut.code === 0 && this.fs.list(dir).includes('audio.m4a') ? audio : null,
      frames: this.fs.list(framesDir).map((name) => join(framesDir, name)),
      release,
    };
  }

  private async fromImages(
    dir: string,
    urls: readonly string[],
    referer: string,
    release: () => Promise<void>,
  ): Promise<Media> {
    const frames: string[] = [];
    for (const [i, url] of urls.slice(0, this.maxFrames).entries()) {
      const path = join(dir, `image-${String(i + 1).padStart(2, '0')}.jpg`);
      this.fs.write(path, await this.options.download(url, referer));
      frames.push(path);
    }
    return { audio: null, frames, release };
  }
}
