import { spawnBatchTranscriber } from '../src/adapters/asr-batch';
import { spawnOcr } from '../src/adapters/ocr-worker';
import { fakeWorker } from './support/fake-child';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('spawnBatchTranscriber', () => {
  const sentence = (text: string, speech: number, music: number) => ({
    start: 1,
    end: 2,
    text,
    speech,
    music,
  });

  it("runs chat-bot's transcribe.py with uv in its own process, and waits for the models", async () => {
    const { spawnProcess, calls } = fakeWorker({ onMessage: () => {} });
    const transcriber = await spawnBatchTranscriber({ asrDir: '/repo/chat-bot/asr', spawnProcess });
    expect(calls[0]).toEqual({
      command: 'uv',
      args: [
        'run',
        '--directory',
        '/repo/chat-bot/asr',
        'transcribe.py',
        '--no-backing-title',
        '--no-backing-gaps',
      ],
    });
    expect(calls[0]!.args).not.toContain('--serve');
    await transcriber.close();
  });

  it('writes a URL, collects the sentences until stream_ended, and quits at the end', async () => {
    const { spawnProcess, written } = fakeWorker({
      onMessage: (m, say) => {
        say(sentence(`听到了 ${String(m.url)}`, 0.9, 0.05));
        say(sentence('第二句', 0.8, 0.1));
        say({ stream_ended: true, code: 0 });
      },
    });
    const transcriber = await spawnBatchTranscriber({ asrDir: '/asr', spawnProcess });
    expect(await transcriber.transcribe('/media/a/audio.m4a')).toEqual({
      sentences: ['听到了 /media/a/audio.m4a', '第二句'],
      song: null,
    });
    await transcriber.close();
    expect(written).toEqual([{ url: '/media/a/audio.m4a' }, { quit: true }]);
  });

  it('sends one URL at a time: the next only after the last stream_ended', async () => {
    let release: () => void = () => {};
    const { spawnProcess, written } = fakeWorker({
      onMessage: (m, say) => {
        const finish = () => say({ stream_ended: true });
        if (m.url === '/a') release = finish;
        else finish();
      },
    });
    const transcriber = await spawnBatchTranscriber({ asrDir: '/asr', spawnProcess });
    const first = transcriber.transcribe('/a');
    const second = transcriber.transcribe('/b');
    await flush();
    await flush();
    expect(written).toEqual([{ url: '/a' }]);
    release();
    await Promise.all([first, second]);
    expect(written).toEqual([{ url: '/a' }, { url: '/b' }]);
    await transcriber.close();
  });

  it('asks Shazam for the title when the sentences score as music, and drops the transcript', async () => {
    const { spawnProcess, written } = fakeWorker({
      onMessage: (m, say) => {
        if (m.url) {
          say(sentence('la la la', 0.2, 0.8));
          say(sentence('na na', 0.3, 0.7));
          say({ stream_ended: true });
        } else if (m.music_id) say({ music_id: m.music_id, title: '海阔天空', artist: 'Beyond' });
      },
    });
    const transcriber = await spawnBatchTranscriber({ asrDir: '/asr', spawnProcess });
    expect(await transcriber.transcribe('/a')).toEqual({
      sentences: [],
      song: { title: '海阔天空', artist: 'Beyond' },
    });
    expect(written[1]).toEqual({ music_id: 1 });
    await transcriber.close();
  });

  it('gives a null song when Shazam found nothing', async () => {
    const { spawnProcess } = fakeWorker({
      onMessage: (m, say) => {
        if (m.url) {
          say(sentence('la', 0.1, 0.9));
          say({ stream_ended: true });
        } else say({ music_id: m.music_id, title: null, artist: null });
      },
    });
    const transcriber = await spawnBatchTranscriber({ asrDir: '/asr', spawnProcess });
    expect(await transcriber.transcribe('/a')).toEqual({ sentences: [], song: null });
    await transcriber.close();
  });

  it('rejects a request when the worker dies in the middle of it', async () => {
    const { spawnProcess } = fakeWorker({ onMessage: (m) => void m });
    const transcriber = await spawnBatchTranscriber({
      asrDir: '/asr',
      spawnProcess,
      timeoutMs: 20,
    });
    await expect(transcriber.transcribe('/a')).rejects.toThrow('timed out');
    await transcriber.close();
  });
});

describe('spawnOcr', () => {
  it('is off with --no-ocr, and off with a warning when not on macOS; it starts nothing', async () => {
    const { spawnProcess, calls } = fakeWorker({ onMessage: () => {} });
    const logs: string[] = [];
    expect(
      await spawnOcr({ ocrDir: '/ocr', enabled: false, spawnProcess, log: (m) => logs.push(m) }),
    ).toBeNull();
    expect(logs).toEqual([]);
    expect(
      await spawnOcr({ ocrDir: '/ocr', platform: 'linux', spawnProcess, log: (m) => logs.push(m) }),
    ).toBeNull();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('不是 macOS');
    expect(calls).toEqual([]);
  });

  it('sends each image as a line and keeps the lines it is sure of', async () => {
    const { spawnProcess, calls, written } = fakeWorker({
      onMessage: (m, say) => {
        if (m.image === '/bad.jpg') say({ error: 'cannot read' });
        else
          say({
            lines: [
              { text: ' 字幕 ', confidence: 0.98 },
              { text: '糊', confidence: 0.1 },
              { text: '', confidence: 1 },
            ],
          });
      },
    });
    const ocr = await spawnOcr({ ocrDir: '/dy-browse/ocr', platform: 'darwin', spawnProcess });
    expect(calls[0]).toEqual({
      command: 'uv',
      args: ['run', '--directory', '/dy-browse/ocr', 'ocr-worker.py'],
    });
    expect(await ocr!.read(['/a.jpg', '/bad.jpg', '/b.jpg'])).toEqual(['字幕', '字幕']);
    await ocr!.close();
    expect(written.map((m) => m.image ?? 'quit')).toEqual(['/a.jpg', '/bad.jpg', '/b.jpg', 'quit']);
  });
});
