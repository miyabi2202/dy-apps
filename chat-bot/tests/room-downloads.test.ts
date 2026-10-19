import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDownloads, runDownloads } from '../src/adapters/room-downloads';

const fakeLog = () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() });

test('reads the download list, skipping entries that could land outside artifacts/', () => {
  const log = fakeLog();
  const config = JSON.stringify({
    private: false,
    download: [
      { url: 'https://example.com/a', file: 'a.json' },
      { url: 'https://example.com/b', file: '../b.json' },
      { url: 'ftp://example.com/c', file: 'c.json' },
      { url: 'https://example.com/d' },
    ],
  });
  expect(readDownloads('room_config.json', { log, read: () => config })).toEqual([
    { url: 'https://example.com/a', file: 'a.json' },
  ]);
  expect(log.warn).toHaveBeenCalledTimes(3);
  expect(readDownloads('room_config.json', { log, read: () => '{ "private": true }' })).toEqual([]);
});

test('downloads into artifacts/, and a failed one keeps the old file and the rest still run', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'room-downloads-')), 'artifacts');
  const log = fakeLog();
  const fetch = jest.fn((url: string | URL | Request) =>
    Promise.resolve(
      (url as string).endsWith('/broken')
        ? new Response('nope', { status: 500 })
        : new Response(`from ${url as string}`),
    ),
  );
  await runDownloads([{ url: 'https://example.com/old', file: 'kept.json' }], dir, { log, fetch });
  await runDownloads(
    [
      { url: 'https://example.com/broken', file: 'kept.json' },
      { url: 'https://example.com/new', file: 'new.json' },
    ],
    dir,
    { log, fetch },
  );
  expect(readFileSync(join(dir, 'kept.json'), 'utf8')).toBe('from https://example.com/old');
  expect(readFileSync(join(dir, 'new.json'), 'utf8')).toBe('from https://example.com/new');
  expect(log.warn).toHaveBeenCalledWith(
    'download failed',
    expect.objectContaining({ file: 'kept.json' }),
  );
});
