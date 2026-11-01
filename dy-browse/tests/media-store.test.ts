import { MediaStore, type MediaFs, type RunCommand } from '../src/adapters/media-store';

/** A fake file system and ffmpeg: the commands log what they were given and drop the files they'd make. */
function setup({
  sceneFrames = 3,
  fpsFrames = 2,
  audioCode = 0,
  failDownload = false,
}: { sceneFrames?: number; fpsFrames?: number; audioCode?: number; failDownload?: boolean } = {}) {
  const files = new Set<string>();
  const commands: string[][] = [];
  const downloads: [string, string][] = [];
  const fs: MediaFs = {
    mkdir: () => {},
    write: (path) => void files.add(path),
    list: (dir) =>
      [...files]
        .filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/'))
        .map((f) => f.slice(dir.length + 1))
        .sort(),
    remove: (path) => {
      for (const f of [...files]) if (f === path || f.startsWith(`${path}/`)) files.delete(f);
    },
  };
  const run: RunCommand = (_command, args) => {
    commands.push([...args]);
    const out = args[args.length - 1]!;
    if (out.endsWith('audio.m4a')) {
      if (audioCode === 0) files.add(out);
      return Promise.resolve({ code: audioCode, stderr: '' });
    }
    const frames = args.includes("select='gt(scene,0.3)',scale=1280:-2") ? sceneFrames : fpsFrames;
    for (let i = 1; i <= frames; i++) files.add(out.replace('%02d', String(i).padStart(2, '0')));
    return Promise.resolve({ code: 0, stderr: '' });
  };
  const store = new MediaStore({
    root: '/media',
    download: (url, referer) => {
      downloads.push([url, referer]);
      return failDownload ? Promise.reject(new Error('403')) : Promise.resolve(new Uint8Array([1]));
    },
    run,
    fs,
  });
  return { store, files, commands, downloads };
}

const video = {
  id: 'v1',
  url: 'https://www.douyin.com/video/v1',
  playUrl: 'https://v.example.invalid/1.mp4',
  imageUrls: [],
};

describe('MediaStore', () => {
  it('downloads the video with the page as referer, takes the audio and keyframes, and deletes the video at once', async () => {
    const { store, files, commands, downloads } = setup();
    const media = await store.fetch(video);
    expect(downloads).toEqual([
      ['https://v.example.invalid/1.mp4', 'https://www.douyin.com/video/v1'],
    ]);
    expect(commands[0]).toEqual([
      '-y',
      '-i',
      '/media/v1/video.mp4',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'aac',
      '/media/v1/audio.m4a',
    ]);
    expect(commands[1]).toEqual(
      expect.arrayContaining(['-vf', "select='gt(scene,0.3)',scale=1280:-2", '-frames:v', '8']),
    );
    expect(media.audio).toBe('/media/v1/audio.m4a');
    expect(media.frames).toEqual([
      '/media/v1/frames/frame-01.jpg',
      '/media/v1/frames/frame-02.jpg',
      '/media/v1/frames/frame-03.jpg',
    ]);
    // The video itself is gone before anyone reads the rest.
    expect(files.has('/media/v1/video.mp4')).toBe(false);
  });

  it('takes a picture every few seconds when the video has no scene changes', async () => {
    const { store, commands } = setup({ sceneFrames: 0, fpsFrames: 2 });
    const media = await store.fetch(video);
    expect(commands).toHaveLength(3);
    expect(commands[2]).toEqual(expect.arrayContaining(['-vf', 'fps=1/3,scale=1280:-2']));
    expect(media.frames).toHaveLength(2);
  });

  it('has no audio when ffmpeg found none', async () => {
    const { store } = setup({ audioCode: 1 });
    expect((await store.fetch(video)).audio).toBeNull();
  });

  it('deletes everything when released, leaving no folder behind', async () => {
    const { store, files } = setup();
    const media = await store.fetch(video);
    expect(files.size).toBeGreaterThan(0);
    await media.release();
    expect(files.size).toBe(0);
  });

  it('deletes what it made when the download fails', async () => {
    const { store, files } = setup({ failDownload: true });
    await expect(store.fetch(video)).rejects.toThrow('403');
    expect(files.size).toBe(0);
  });

  it("takes an image post's own images as its frames, with no audio", async () => {
    const { store, commands, downloads } = setup();
    const media = await store.fetch({
      ...video,
      playUrl: null,
      imageUrls: ['https://i.example.invalid/1.jpeg', 'https://i.example.invalid/2.jpeg'],
    });
    expect(commands).toEqual([]);
    expect(downloads).toHaveLength(2);
    expect(media.audio).toBeNull();
    expect(media.frames).toEqual(['/media/v1/image-01.jpg', '/media/v1/image-02.jpg']);
  });
});
