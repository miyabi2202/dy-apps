import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDownloads, runDownloads } from '../../../src/adapters/files/room-downloads';

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
      { url: 'https://example.com/e', file: 'e.txt', transformer: '../x.js' },
      { url: 'https://example.com/f', file: 'f.txt', transformer: 'additional_commands/f/f.js' },
    ],
  });
  expect(readDownloads('room_config.json', { log, read: () => config })).toEqual([
    { url: 'https://example.com/a', file: 'a.json' },
    { url: 'https://example.com/f', file: 'f.txt', transformer: 'additional_commands/f/f.js' },
  ]);
  expect(log.warn).toHaveBeenCalledTimes(4);
  expect(readDownloads('room_config.json', { log, read: () => '{ "private": true }' })).toEqual([]);
});

test('downloads into artifacts/, and a failed one keeps the old file and the rest still run', async () => {
  const room = mkdtempSync(join(tmpdir(), 'room-downloads-'));
  const dir = join(room, 'artifacts');
  const log = fakeLog();
  const fetch = jest.fn((url: string | URL | Request) =>
    Promise.resolve(
      (url as string).endsWith('/broken')
        ? new Response('nope', { status: 500 })
        : new Response(`from ${url as string}`),
    ),
  );
  await runDownloads([{ url: 'https://example.com/old', file: 'kept.json' }], room, { log, fetch });
  await runDownloads(
    [
      { url: 'https://example.com/broken', file: 'kept.json' },
      { url: 'https://example.com/new', file: 'new.json' },
    ],
    room,
    { log, fetch },
  );
  expect(readFileSync(join(dir, 'kept.json'), 'utf8')).toBe('from https://example.com/old');
  expect(readFileSync(join(dir, 'new.json'), 'utf8')).toBe('from https://example.com/new');
  expect(log.warn).toHaveBeenCalledWith(
    'download failed',
    expect.objectContaining({ file: 'kept.json' }),
  );
});

test("a transformer, run in the room's folder with what was fetched on stdin, decides what's kept", async () => {
  const room = mkdtempSync(join(tmpdir(), 'room-downloads-'));
  mkdirSync(join(room, 'transformers'));
  writeFileSync(
    join(room, 'transformers', 'upper.js'),
    "import { readFileSync } from 'node:fs';\nprocess.stdout.write(readFileSync(0, 'utf8').toUpperCase());\n",
  );
  writeFileSync(join(room, 'transformers', 'broken.js'), 'process.exit(3);\n');
  const log = fakeLog();
  const fetch = () => Promise.resolve(new Response('晴天 lemon'));
  await runDownloads(
    [{ url: 'https://example.com/a', file: 'a.txt', transformer: 'transformers/upper.js' }],
    room,
    { log, fetch },
  );
  expect(readFileSync(join(room, 'artifacts', 'a.txt'), 'utf8')).toBe('晴天 LEMON');

  // A transformer that fails keeps the old file.
  await runDownloads(
    [{ url: 'https://example.com/a', file: 'a.txt', transformer: 'transformers/broken.js' }],
    room,
    { log, fetch },
  );
  expect(readFileSync(join(room, 'artifacts', 'a.txt'), 'utf8')).toBe('晴天 LEMON');
  expect(log.warn).toHaveBeenCalledWith(
    'download failed',
    expect.objectContaining({ file: 'a.txt' }),
  );
});
