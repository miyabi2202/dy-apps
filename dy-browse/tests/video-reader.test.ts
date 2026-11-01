import { jsonStateStore } from '../src/app/json-state-store';
import type { BatchTranscriber, Media, MediaFetcher, Ocr } from '../src/app/ports';
import { StreamGuard } from '../src/app/stream-guard';
import { VideoReader } from '../src/app/video-reader';
import { StreamStartedError } from '../src/core/errors';
import { RunState } from '../src/core/run-state';
import { item } from './support/fakes';
import { MemoryStore } from './support/memory-store';

function setup({
  asr = true,
  ocr = true,
  streamOn = false,
  fetchFails = false,
  song = null as { title: string; artist: string } | null,
}: {
  asr?: boolean;
  ocr?: boolean;
  streamOn?: boolean;
  fetchFails?: boolean;
  song?: { title: string; artist: string } | null;
} = {}) {
  const log: string[] = [];
  const data = new MemoryStore();
  const state = () => new RunState(jsonStateStore(data), '2026-11-01');
  const media: MediaFetcher = {
    fetch: (i) => {
      log.push(`fetch ${i.id}`);
      if (fetchFails) return Promise.reject(new Error('403'));
      const fetched: Media = {
        audio: `/m/${i.id}/audio.m4a`,
        frames: [`/m/${i.id}/f1.jpg`],
        release: () => Promise.resolve(void log.push(`release ${i.id}`)),
      };
      return Promise.resolve(fetched);
    },
  };
  const transcriber: BatchTranscriber = {
    transcribe: (path) => {
      log.push(`transcribe ${path}`);
      return Promise.resolve({ sentences: song ? [] : ['你好'], song });
    },
    close: () => Promise.resolve(),
  };
  const ocrWorker: Ocr = {
    read: (images) => {
      log.push(`ocr ${images.join(',')}`);
      return Promise.resolve(['字幕']);
    },
    close: () => Promise.resolve(),
  };
  const logs: string[] = [];
  const reader = (s = state()) =>
    new VideoReader({
      media,
      transcriber: asr ? transcriber : null,
      ocr: ocr ? ocrWorker : null,
      state: s,
      guard: new StreamGuard(() => Promise.resolve(streamOn)),
      log: (m) => logs.push(m),
    });
  return { reader, state, log, logs, data };
}

describe('VideoReader', () => {
  it('downloads, transcribes, OCRs, writes each stage to the state, and releases the media', async () => {
    const { reader, state, log } = setup();
    const material = await reader().read(item('v1'));
    expect(log).toEqual([
      'fetch v1',
      'transcribe /m/v1/audio.m4a',
      'ocr /m/v1/f1.jpg',
      'release v1',
    ]);
    expect(material).toEqual({ transcript: ['你好'], song: null, ocr: ['字幕'] });
    expect(state().get('v1')).toEqual({
      stage: 'done',
      transcript: ['你好'],
      song: null,
      ocr: ['字幕'],
    });
  });

  it('on a rerun skips what is done: nothing is fetched twice', async () => {
    const { reader, log } = setup();
    await reader().read(item('v1'));
    log.length = 0;
    expect(await reader().read(item('v1'))).toEqual({
      transcript: ['你好'],
      song: null,
      ocr: ['字幕'],
    });
    expect(log).toEqual([]);
  });

  it('picks up at the stage where an earlier run stopped', async () => {
    const { reader, state, log } = setup();
    state().advance('v1', 'transcribed', { transcript: ['已经转写'], song: null });
    const material = await reader().read(item('v1'));
    expect(log).toEqual(['fetch v1', 'ocr /m/v1/f1.jpg', 'release v1']);
    expect(material?.transcript).toEqual(['已经转写']);
  });

  it('releases the media even when the transcriber throws, and carries on', async () => {
    const { state, log, logs } = setup();
    const failing = new VideoReader({
      media: {
        fetch: () =>
          Promise.resolve({
            audio: '/a',
            frames: [],
            release: () => Promise.resolve(void log.push('released')),
          }),
      },
      transcriber: {
        transcribe: () => Promise.reject(new Error('asr down')),
        close: () => Promise.resolve(),
      },
      ocr: null,
      state: state(),
      guard: new StreamGuard(() => Promise.resolve(false)),
      log: (m) => logs.push(m),
    });
    expect(await failing.read(item('v1'))).toBeNull();
    expect(log).toEqual(['released']);
    expect(logs[0]).toContain('asr down');
  });

  it('skips the item, not the run, when the media cannot be fetched', async () => {
    const { reader, logs, state } = setup({ fetchFails: true });
    expect(await reader().read(item('v1'))).toBeNull();
    expect(logs[0]).toContain('media failed');
    expect(state().get('v1')?.stage).toBe('metadata');
  });

  it('ends the run, cleanly, when a stream has started: checked before each job', async () => {
    const { reader, log } = setup({ streamOn: true });
    await expect(reader().read(item('v1'))).rejects.toBeInstanceOf(StreamStartedError);
    expect(log).toEqual([]);
  });

  it('with --no-asr only reads picture text; with --no-ocr only speech; with neither it fetches nothing', async () => {
    const noAsr = setup({ asr: false });
    expect(await noAsr.reader().read(item('v1'))).toEqual({
      transcript: [],
      song: null,
      ocr: ['字幕'],
    });
    expect(noAsr.log).toEqual(['fetch v1', 'ocr /m/v1/f1.jpg', 'release v1']);
    const noOcr = setup({ ocr: false });
    expect(await noOcr.reader().read(item('v1'))).toMatchObject({ transcript: ['你好'], ocr: [] });
    expect(noOcr.log).toEqual(['fetch v1', 'transcribe /m/v1/audio.m4a', 'release v1']);
    const neither = setup({ asr: false, ocr: false });
    expect(await neither.reader().read(item('v1'))).toBeNull();
    expect(neither.log).toEqual([]);
  });

  it('a later run with the speech turned on still does the speech a --no-asr run skipped', async () => {
    const off = setup({ asr: false });
    await off.reader().read(item('v1'));
    const on = setup();
    const again = new VideoReader({
      media: {
        fetch: () =>
          Promise.resolve({ audio: '/a', frames: ['/f'], release: () => Promise.resolve() }),
      },
      transcriber: {
        transcribe: () => Promise.resolve({ sentences: ['后来转写'], song: null }),
        close: () => Promise.resolve(),
      },
      ocr: null,
      state: new RunState(jsonStateStore(off.data), '2026-11-01'),
      guard: new StreamGuard(() => Promise.resolve(false)),
      log: () => {},
    });
    expect((await again.read(item('v1')))?.transcript).toEqual(['后来转写']);
    expect(on.log).toEqual([]);
  });

  it('keeps a recognised song and no transcript', async () => {
    const { reader } = setup({ song: { title: '海阔天空', artist: 'Beyond' } });
    expect(await reader().read(item('v1'))).toMatchObject({
      transcript: [],
      song: { title: '海阔天空' },
    });
  });

  it('reads an image post by OCR only, and leaves ads, live cards and shop links alone', async () => {
    const { reader, log } = setup();
    expect(await reader().read(item('i1', null, { kind: 'images', playUrl: null }))).toMatchObject({
      ocr: ['字幕'],
    });
    expect(log).toEqual(['fetch i1', 'ocr /m/i1/f1.jpg', 'release i1']);
    log.length = 0;
    for (const kind of ['ad', 'live', 'shop'] as const)
      expect(await reader().read(item(kind, null, { kind }))).toBeNull();
    expect(log).toEqual([]);
  });
});
