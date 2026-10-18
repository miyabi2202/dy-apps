import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { liveRoomConfig, liveSection, roomFiles } from '../src/adapters/room-files';

test('reads one section of a Markdown file, as it is now', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'room-files-')), 'commands.md');
  const commands = liveSection(file, 'The commands');
  expect(commands()).toBe('');

  writeFileSync(
    file,
    '# Commands\n\nIntro\n\n## The commands\n\n/识歌\n\n### /识歌\n\nNames it\n\n## How\n\nInternals\n',
  );
  expect(commands()).toBe('## The commands\n\n/识歌\n\n### /识歌\n\nNames it');

  writeFileSync(file, '## The commands\n\n/回复\n');
  expect(commands()).toBe('## The commands\n\n/回复');
});

test('room_config.json starts not private, and is read again as it changes', () => {
  const { config } = roomFiles(mkdtempSync(join(tmpdir(), 'room-files-')));
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ private: false });
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const roomConfig = liveRoomConfig(config, { log });
  expect(roomConfig()).toEqual({ private: false });

  writeFileSync(config, '{ "private": true }');
  expect(roomConfig()).toEqual({ private: true });

  writeFileSync(config, '{ "private": "yes" }');
  expect(roomConfig()).toEqual({ private: true });
  expect(log.warn).toHaveBeenCalled();
});
